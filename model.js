function snakeCase(str) {
  return str
    .split(/(?=[A-Z])/)
    .join("_")
    .toLowerCase();
}

function mapDataType(type) {
  const types = {
    int: "number",
    tinyint: "number",
    smallint: "number",
    mediumint: "number",
    bigint: "number",
    bit: "number",
    double: "number",
    float: "number",
    decimal: "number",
    numeric: "number",
    boolean: "boolean",
    date: "string",
    time: "string",
    datetime: "string",
    timestamp: "string",
    year: "string",
    tinytext: "string",
    text: "string",
    longtext: "string",
    mediumtext: "string",
    blob: "string",
    varchar: "string",
    char: "string"
    // Others like enum, polygon, etc...
  };

  return types[type] || "string";
}

class Model {
  constructor(pool) {
    this.db = pool;
    this.table = snakeCase(this.constructor.name);
    this.fields = {};

    // Load our fields from DB
    this.db.loadSchema().then(fields => {
      fields[this.table].forEach(field => {
        field["js_type"] = mapDataType(field.type);
      });

      this.fields = fields[this.table];
    });
  }

  // Basic validation checking params all match expected columns and types
  validate(params) {
    if (!params) return null;

    const errors = {};
    Object.keys(params).forEach(field => {
      if (!this.fields[field]) {
        errors[field] = errors[field] || [];
        errors[field].push("Unknown field");
        return;
      }

      const f = this.fields[field];

      // We allow NULL
      if (!params[field] && f.nullable) {
        return;
      }

      // Too big
      if (params[field] && f.length < params[field].length) {
        errors[field] = errors[field] || [];
        errors[field].push(`Maximum length of ${field} is ${f.length}`);
      }

      // Wrong type
      if (f.js_type !== typeof params[field]) {
        // Boolean values are TINYINT(1)
        if (
          f.js_type === "number" &&
          f.length === 3 &&
          typeof params[field] === "boolean"
        ) {
          // true/false is allowed in TINYINT(1)/BOOLEAN columns
        } else if (f.js_type === "number" && /^\d+$/.test(params[field])) {
          // We allow numbers in query strings and POST body
          // JSON decodes numbers correctly
        } else {
          errors[field] = errors[field] || [];
          errors[field].push(`${field} should be a ${f.js_type}`);
        }
      }
    });

    if (!Object.keys(errors).length) {
      return null;
    }

    return errors;
  }

  // Find a single row and return it.
  findOne(params) {
    return this.findAll(params, 1, 0).then(
      rows => (rows.length ? rows[0] : null)
    );
  }

  // Find all rows
  findAll(params, limit, offset, column) {
    const where = this.where(params);

    const sql = `SELECT ${column || "*"} FROM ${this.table}${where}
    ${limit ? ` LIMIT ${Number(limit)}` : ""}
    ${offset ? ` OFFSET ${Number(offset)}` : ""}`;

    return this.db.query(sql, Object.values(params || {}));
  }

  // Make an array of values from a single column
  findAllColumn(column, params, limit, offset) {
    return this.findAll(params, limit, offset, column).then(rows => {
      const values = [];
      rows.forEach(row => {
        values.push(row[column]);
      });
      return values;
    });
  }

  // eslint-disable-next-line class-methods-use-this
  where(params) {
    let where = "";
    if (Object.keys(params || {}).length) {
      where = [];
      Object.keys(params).forEach(key => {
        if (params[key] instanceof Array) {
          where.push(`${key} in (?)`);
        } else {
          where.push(`${key} = ?`);
        }
      });

      where = ` WHERE ${where.join(" AND ")}`;
    }

    return where;
  }

  // Save record using insert or update as needed. Also adds timestamps.
  save(data) {
    if (data.id) {
      if (this.fields.created_at && data.created_at) {
        delete data.created_at;
      }

      if (this.fields.updated_at) {
        data.updated_at = this.db.now();
      }

      return this.update(data).then(changedRows => {
        if (!changedRows) {
          throw new Error(`Error updating ${Number(data.id)}`);
        }
        return data.id;
      });
    }

    if (this.fields.created_at) {
      data.created_at = this.db.now();
    }

    return this.insert(data);
  }

  // Insert a new record returning the PK
  insert(data, ignoreDuplicates) {
    const fields = `${Object.keys(data).join(", ")}`;

    const sql = `INSERT ${ignoreDuplicates ? "IGNORE" : ""} INTO ${
      this.table
    } (${fields})
      VALUES (${"?,".repeat(Object.keys(data).length - 1)}?)`;

    return this.db
      .query(sql, Object.values(data))
      .then(result => result.insertId);
  }

  // Update an existing record by PK
  update(data) {
    const sql = `UPDATE ${this.table} SET ? WHERE id = ?`;

    if (!data.id) {
      return Promise.reject(new Error("Missing id"));
    }

    return this.db.query(sql, [data, data.id]).then(
      result =>
        // A row might be 'updated' to the same value it already has
        result.affectedRows
    );
  }

  // MySQL allows you to update a row if a value matches
  // an existing record's primary/unique key
  // WARNING: caution with the return value from this function!
  insertOrUpdate(data) {
    const fields = `${Object.keys(data).join(", ")}`;

    const duplicateFields = [];
    Object.keys(data).forEach(key => {
      // No reason to update the primary key
      // ^ What if it's used for lookups???
      // if (this.fields[key].primary) {

      // Do not update the createdAt timestamp
      if (key === "created_at" || key === "createdAt") {
        return;
      }

      duplicateFields.push(`${key} = VALUES(${key})`);
    });

    const sql = `INSERT INTO ${this.table} (${fields})
        VALUES (${"?,".repeat(Object.keys(data).length - 1)}?)
        ON duplicate key UPDATE ${duplicateFields.join(", ")}`;

    return this.db.query(sql, Object.values(data)).then(result =>
      // If insert or update changes anything
      // - insertId will be the non-zero row.id affected
      // - affectedRows = 2
      // else
      // - insertId = 0
      // - affectedRows = 1
      // Note: this can cause a logic flaw where a valid insert
      // that is identical to an existing row does not return an ID
      ({
        affectedRows: result.affectedRows,
        insertId: result.insertId
      })
    );
  }

  // Delete by ID
  DeleteById(id) {
    return this.db
      .query(`DELETE FROM ${this.table} WHERE id = ?`, [id])
      .then(r => r.changedRows);
  }
}

module.exports = Model;
