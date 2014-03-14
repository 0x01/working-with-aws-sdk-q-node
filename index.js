/* jshint node:true,
    bitwise:true, strict:true, nonew:true, undef:true,
    noempty:true, eqeqeq:true, forin:true, noarg:true */
"use strict";

var Q = require('q');
var _ = require('lodash');
var AWS = require('aws-sdk');


// AWS SDK methods can be called with a callback, like this:
//
// ```
// dynamodb.getItem(params, function(err, data){ ... });
// ```
//
// Or without, in which case we get a `AWS.Request` object that will
// not execute until we call `.send()` on it. Before we do that we
// add listeners on error and success and just delegate those to the
// `deferred` methods.

/** Turns an AWS.Request into a promise. */
function mkPromise(request){
    var deferred = Q.defer();
    request.on('error', deferred.reject);
    request.on('success', function(response){
        deferred.resolve(response.data);
    });
    request.send();
    return deferred.promise;
}

// We need two helper functions `format` and `unformat` which converts
// between JSON and "typed" DynamoDB items.
//
// So this
// ```
// { key: 'value',
//   num: 123,
//   strings: ['a','b'],
//   nrs: [1,2] }
// ```
// Must be converted to/from this:
// ```
// { key: {S: 'value'},
//   num: {N: 123},
//   strings: {SS: ['a','b']},
//   nrs: {NS: [1,2]} }
// ```
// Binary data (`B` and `BS`) support is left as an exercise ;-)

/** Convert from javascript object to 'typed' DynamoDB Item */
function format(object) {
    return _(object)
        .mapValues(function(value,key){
            if (_.isArray(value)) {
                var first = _.first(value);
                if (_.isString(first))
                    return { SS: _.uniq(value) };
                if (_.isNumber(first))
                    return { NS: _.uniq(value) };
                throw new Error('BS type unsupported');
            }

            if (_.isNumber(value))
                return { N: value.toString() };
            if (_.isString(value))
                return { S: value };
            throw new Error('B type unsupported');
        }).value();
}

/** from dynamodb Item to javascript object */
function unformat(item) {
    return _(item)
        .mapValues(function(value, key){
            var type = _(value).keys().first();
            if (type === 'N') {
                if (value.N.match(/\./)) // numbers can be float or integer
                    return parseFloat(value.N);
                return parseInt(value.N, 10);
            }
            return value[type];
        }).value();
}

// We store our credentials and table names in a config file.
// You shouldn't check this file into SCM, instead have different files
// for different environments (staging, production).

/** Example config.json:
 ```
 {
    "dynamodb" : {
        "region" : "eu-west-1",
        "access_key" : "...",
        "secret_key" : "...",
        "table_names": {
            "users" : "staging.users.foo.com"
        }
    }
 }
 ```
*/
var config = require('./config');

// Setup database instance
var dynamodb = new AWS.DynamoDB({
    accessKeyId: config.dynamodb.access_key,
    secretAccessKey: config.dynamodb.secret_key,
    region: config.dynamodb.region
});

// Now we create convenient wrapper functions around aws-sdk that
// return promises

var User = {};
User.get = function(username) {
    var params = {
        TableName: config.dynamodb.table_names.users,
        ConsistentRead: true,
        Key: {email_address: {S: username}}
    };
    return mkPromise(dynamodb.getItem(params))
        .then(function(data){
            return data && data.Item && unformat(data.Item);
        });
};

User.create = function(user) {
    var params = {
        TableName: config.dynamodb.table_names.users,
        Item: format(user)
    };
    return mkPromise(dynamodb.getItem(params))
        .then(function(data){
            return user;
        });
};

// we can now chain our DB operations nicely
User.get('jelleherold@gmail.com')
    .then(function(user){
        if(!user)
        {
            console.log('user not found, creating one');

            var newUser = {
                email_address: 'jelle@defekt.nl',
                first_name: 'Jelle',
                last_name: 'Herold'
            };

            return User.create(newUser);
        }
        else
            console.log('user: ', user);
    })
    .then(function(newUser){
        console.log('created user with email address', newUser.email_address);
    })
    .fail(console.error);