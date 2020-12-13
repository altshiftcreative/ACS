/**
 * Copyright 2013-2019  GenieACS Inc.
 *
 * This file is part of GenieACS.
 *
 * GenieACS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * GenieACS is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with GenieACS.  If not, see <http://www.gnu.org/licenses/>.
 */

import * as config from "../lib/config";
import * as logger from "../lib/logger";
import * as cluster from "../lib/cluster";
import * as server from "../lib/server";
import { listener } from "../lib/ui";
import * as extensions from "../lib/extensions";
import * as db from "../lib/ui/db";
import * as db2 from "../lib/db";
import * as cache from "../lib/cache";
import { version as VERSION } from "../package.json";

logger.init("ui", VERSION);

const SERVICE_ADDRESS = config.get("UI_INTERFACE") as string;
const SERVICE_PORT = config.get("UI_PORT") as number;

function exitWorkerGracefully(): void {
  setTimeout(exitWorkerUngracefully, 5000).unref();
  Promise.all([
    db.disconnect(),
    db2.disconnect(),
    cache.disconnect(),
    extensions.killAll(),
    cluster.worker.disconnect(),
  ]).catch(exitWorkerUngracefully);
}

function exitWorkerUngracefully(): void {
  extensions.killAll().finally(() => {
    process.exit(1);
  });
}

if (!cluster.worker) {
  const WORKER_COUNT = config.get("UI_WORKER_PROCESSES") as number;

  logger.info({
    message: `genieacs-ui starting`,
    pid: process.pid,
    version: VERSION,
  });

  cluster.start(WORKER_COUNT, SERVICE_PORT, SERVICE_ADDRESS);

  process.on("SIGINT", () => {
    logger.info({
      message: "Received signal SIGINT, exiting",
      pid: process.pid,
    });

    cluster.stop();
  });

  process.on("SIGTERM", () => {
    logger.info({
      message: "Received signal SIGTERM, exiting",
      pid: process.pid,
    });

    cluster.stop();
  });
} else {
  const key = config.get("UI_SSL_KEY") as string;
  const cert = config.get("UI_SSL_CERT") as string;
  const options = {
    port: SERVICE_PORT,
    host: SERVICE_ADDRESS,
    ssl: key && cert ? { key, cert } : null,
    timeout: 30000,
  };

  let stopping = false;

  process.on("uncaughtException", (err) => {
    if ((err as NodeJS.ErrnoException).code === "ERR_IPC_DISCONNECTED") return;
    logger.error({
      message: "Uncaught exception",
      exception: err,
      pid: process.pid,
    });
    stopping = true;
    server.stop().then(exitWorkerGracefully).catch(exitWorkerUngracefully);
  });

  const _listener = (req, res): void => {
    if (stopping) {
      res.setHeader("Connection", "close");
    }
    res.setHeader("Access-Control-Allow-Origin","http://localhost:4200");
    res.setHeader("Access-Control-Allow-Methods","GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Origin, Content-Type, X-Auth-Token");
    res.setHeader("Access-Control-Allow-Credentials","true");
    res.setHeader("Access-Control-Expose-Headers","Set-Cookie");

    
    if (req.method === "OPTIONS") {
      console.log("Options",req.headers)
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.writeHead(200)
    } else {
      res.setHeader('Access-Control-Allow-Origin', "http://localhost:4200");
    }
  
    listener(req, res);
  };

  const initPromise = Promise.all([db2.connect(), cache.connect()])
    .then(() => {
      server.start(options, _listener);
    })
    .catch((err) => {
      setTimeout(() => {
        throw err;
      });
    });

  process.on("SIGINT", () => {
    stopping = true;
    initPromise.finally(() => {
      server.stop().then(exitWorkerGracefully).catch(exitWorkerUngracefully);
    });
  });

  process.on("SIGTERM", () => {
    stopping = true;
    initPromise.finally(() => {
      server.stop().then(exitWorkerGracefully).catch(exitWorkerUngracefully);
    });
  });
}
