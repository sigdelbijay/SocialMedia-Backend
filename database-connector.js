((databaseConnector) => {
    'use strict';

    const path = require('path');
    const mongodb = require('mongodb');
    const MongoClient = mongodb.MongoClient;

    databaseConnector.init = (app) => {
        let dbUrl = `mongodb://:*@54.253.98.145/SocialMedia`;

        MongoClient.connect(dbUrl)
            .then((client) => {
                app.locals.db = client.db('SocialMedia');
                console.log('database connection success');
                // return client;
            })
            .catch((err) => {
                console.log(err + 'database connection error');
            });

    };

})(module.exports);
