const mysql = require("mysql");
const path = require("path");
// const stream = require('stream');
const fs = require("fs");
const Model = require("./model");

// Simple query wrapper
function query(pool, sql, params) {
  return new Promise((resolve, reject) => {
    pool.getConnection((error, connection) => {
      if (error) {
        reject(error);
        return;
      }

      connection.query(sql, params, (err, results) => {
        connection.release();

        if (err) {
          reject(err);
          return;
        }

        resolve(results);
      });
    });
  });
}

// https://github.com/mysqljs/mysql#streaming-query-rows
// Process results one-at-a-time
function unbufferedQuery(pool, sql, params, callback) {
  return new Promise((resolve, reject) => {
    pool.getConnection((error, connection) => {
      if (error) {
        reject(error);
        return;
      }

      connection
        .query(sql, params)
        .on("error", err => {
          // Handle error, an 'end' event will be emitted after this as well
          reject(err);
        })
        // .on('fields', (fields) => {
        //   // the field packets for the rows to follow
        // })
        .on("result", row => {
          // Pausing the connnection is useful if your processing involves I/O
          // You are guaranteed that no more 'result' events will fire after calling pause()
          connection.pause();

          // If the callback takes to long MySQL will close the connection
          callback(row)
            .then(connection.resume)
            .catch(err => {
              reject(err);
            });
        })
        .on("end", () => {
          // all rows have been received
          connection.release();
          resolve();
        });
    });
  });
}

// https://github.com/mysqljs/mysql#piping-results-with-streams
// using stream.Transform: https://github.com/mysqljs/mysql/issues/1370
// Streaming results with automatic pause/resume, based on downstream congestion
function streamingQuery(pool, sql, params, bufferSize, streamObject) {
  return new Promise((resolve, reject) => {
    pool.getConnection((error, connection) => {
      if (error) {
        reject(error);
        return;
      }

      connection
        .query(sql, params)
        .on("error", err => {
          // Handle error, an 'end' event will be emitted after this as well
          reject(err);
        })
        // https://github.com/mysqljs/mysql#piping-results-with-streams
        .stream({ highWaterMark: bufferSize })
        .pipe(streamObject)
        .on("finish", () => {
          connection.release();
          resolve();
        });
    });
  });
}

// Wrapper to send MySQL rows as CSV download to express "res" object
function streamingQueryToCSVDownload(pool, sql, params, bufferSize, res) {
  const csvStream = csv.createWriteStream({
    headers: true
  });

  res.setHeader("Content-disposition", "attachment; filename=download.csv");
  res.setHeader("Content-type", "text/csv");
  csvStream.pipe(res);

  return streamingQuery(sql, params, bufferSize, csvStream).then(() => {
    res.end();
  });
}

// Reduce a query into an object of pairs
function pairs(pool, sql, params) {
  return query(pool, sql, params).then(rows => {
    const result = {};

    if (!rows || !rows.length) {
      return result;
    }

    const keys = Object.keys(rows[0]);
    if (keys.length !== 2) {
      throw new Error("Invalid number of result columns");
    }

    rows.forEach(row => {
      result[row[keys[0]]] = row[keys[1]];
    });

    return result;
  });
}

function loadSchema(pool) {
  const sql = `select * from INFORMATION_SCHEMA.columns
  WHERE TABLE_SCHEMA = database()
  ORDER BY table_name, ordinal_position`;

  return query(pool, sql).then(rows => {
    const tables = {};
    rows.forEach(row => {
      tables[row.TABLE_NAME] = tables[row.TABLE_NAME] || {};

      const field = {
        type: row.DATA_TYPE,
        nullable: row.IS_NULLABLE === "YES",
        default: row.COLUMN_DEFAULT ? row.COLUMN_DEFAULT : null,
        length: row.CHARACTER_MAXIMUM_LENGTH,
        precision: row.NUMERIC_PRECISION,
        scale: row.NUMERIC_SCALE,
        index: row.COLUMN_KEY ? true : false,
        primary: row.COLUMN_KEY === "PRI",
        unique: row.COLUMN_KEY === "UNI"
      };

      tables[row.TABLE_NAME][row.COLUMN_NAME] = row;
    });
    resolve(tables);
  });
}

module.exports = {
  query,
  unbufferedQuery,
  streamingQuery,
  streamingQueryToCSVDownload,
  pairs,
  loadSchema,
  Model
};
