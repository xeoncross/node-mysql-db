## node-mysql-db

This library is a basic query builder and assumes you want to write SQL for
anything outside basic CRUD operations. It's a light-weight wrapper around [node-mysql](https://github.com/mysqljs/mysql) to provide a promise-based API
and support for streaming large result sets for processing.

## Why?

I write code in a lot of languages and interface with a number of datastores. There are many ORM's and Query Builders for each language and most have substantial overhead while only providing a subset of features.

I wanted a simple wrapper for handling streaming / unbuffered queries / big data in node. Extra helpers for basic CRUD operations are included in the form of a base Model class that can be extended.


## Query Usage

All queries are preformed using prepared statements and returned as promises.

```javascript

const mysql = require('mysql');
const db = require('node-mysql-db');

// https://github.com/mysqljs/mysql#pooling-connections
const pool = mysql.createPool({
  connectionLimit: 100,
  debug: false,
  host: '',
  port: '',
  user: '',
  password: '',
  database: '',
  charset: "utf8mb4",
});


db.query(pool, 'SELECT * FROM user WHERE name LIKE ?', '%John%').then(users => {
  console.log('users', users);
}).catch(error => {
  console.log(error.message);
});

```


## Streaming Usage

Streaming large collections of objects is easy.

```javascript

const mysql = require('mysql');
const db = require('node-mysql-db');
const stream = require('stream');

// https://github.com/mysqljs/mysql#pooling-connections
const pool = mysql.createPool({...});

// Create a stream manually (or use some module like `fast-csv`)
const mystream = stream.Transform({
  objectMode: true,
  transform(row, encoding, callback) {
    // do something with data...
    console.log(row);

    callback();

    // or slow downstream to simulate congested network:
    // setTimeout(callback, x * 1000);
  },
});

const sql = 'SELECT * FROM bigdata';

db.streamingQuery(pool, sql, [], 100, mystream).then(() => {
  console.log('finished');
})

```

## CSV Download for Express.js

```javascript

const mysql = require('mysql')
const db = require('node-mysql-db')
const express = require('express')

const app = express()
const pool = mysql.createPool({...})

app.get('/api/endpoint', (req, res, next) => {
  const sql = 'SELECT * FROM bigdata';

  db.streamingQueryToCSVDownload(pool, sql, [], 100, res).then(() => {
    console.log('Finished sending CSV');
  }).catch(err => {
    next(err);
  })
})


app.listen(3000, () => console.log('Example app listening on port 3000!'))

```


# Models

Provided is a simple model object that can be used to quickly get up and running
with a certain database entity.

```js
const mysql = require('mysql')
const db, { Model } = require('node-mysql-db')

const pool = mysql.createPool({...})

class User extends Model {}

module.exports = new User(pool);
```

Which can then be used as a basic query builder / ORM.

```js
const User = require('./models/user');

// Find all users belonging to these companies
User.findAll({company_id: [34, 65]}).then(users => {
  console.log('users', users);
}).catch(err => {
  console.log(err.message);
});

// INSERT a record
const data = {Name: 'John', email: 'john@example.com'};
User.save(data).then(id => {
  data.id = id;

  // Calling with an `id` will result in an UPDATE this time
  return User.save(data).then(newId => {
    console.log(id === newId); // Same record
  });
}).catch(err => console.log(err));
```
