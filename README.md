## node-mysql-db

This library is a basic query builder and assumes you want to write SQL for
anything outside basic CRUD operations. It's a light-weight wrapper around [node-mysql](https://github.com/mysqljs/mysql).

## Why?

I write code in a lot of languages and interface with a number of datastores. There are many ORM's and Query Builders for each language (Alchemy, Doctrine, Active Record, Knex, etc..)

SQL is already an abstraction and I am happy with it.

I wanted a simple wrapper for handling streaming / unbuffered queries / big data in node. Extra helpers for basic CRUD operations is also handy.


## Usage

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
