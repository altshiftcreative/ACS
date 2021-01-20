# To build a docker image of current path 
# docker build -t altshiftcreative/acs:latest .
# Or
# npm run build-docker

# To run and test built image
# docker run -p 7547:7547 -p 3000:3000 -d altshiftcreative/acs:latest

# Don't forget to clean and run build before building the docker image 

FROM node:12

# Create app directory
WORKDIR /usr/src/app

# Bundle app source
COPY ./dist/ .
RUN npm install

EXPOSE 7547 3000
CMD [ "npm", "run", "start" ]