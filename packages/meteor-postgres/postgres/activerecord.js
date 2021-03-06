pg = Npm.require('pg'); // Node-Postgres
var clientHolder = {}; // TODO: WTF

ActiveRecord = function (table, conString) {

  // initialize class
  this.conString = conString || 'postgres://postgres:1234@localhost/postgres'; // TODO: REMOVE
  this.table = table;

  // inputString used by queries, overrides other strings
  // includes: create table, create relationship, drop table, insert
  this.inputString = '';
  this.autoSelectData = '';
  this.autoSelectInput = '';

  // statement starters
  this.selectString = '';
  this.updateString = '';
  this.deleteString = '';

  // chaining statements
  this.joinString = '';
  this.whereString = '';

  // caboose statements
  this.orderString = '';
  this.limitString = '';
  this.offsetString = '';
  this.groupString = '';
  this.havingString = '';

  this.dataArray = [];

  // error logging
  this.prevFunc = '';

  this.prototype = ActiveRecord.prototype;
};

ActiveRecord.prototype._DataTypes = {
  $number: 'integer',
  $string: 'varchar(255)',
  $json: 'json',
  $datetime: 'date',
  $float: 'decimal',
  $seq: 'serial',
  $bool: 'boolean'
};

ActiveRecord.prototype._TableConstraints = {
  $unique: 'unique',
  $check: 'check ', // value
  $exclude: 'exclude',
  $notnull: 'not null',
  $default: 'default ', // value
  $primary: 'primary key'
};

// Parameters: tableObj (req)
// SQL: CREATE TABLE field data type constraint
// Special: Function is required for all SQL collections
// QUERY/INPUT STRING/MUST USE PRESCRIBED DATA TYPES & TABLE CONSTRAINTS
ActiveRecord.prototype.createTable = function (tableObj) {

  var startString = 'CREATE TABLE ' + this.table + ' (';
  var item, subKey, valOperator, inputString = '';

  for (var key in tableObj) {
    inputString += key + ' ';
    inputString += this._DataTypes[tableObj[key][0]];
    if (Array.isArray(tableObj[key]) && tableObj[key].length > 1) {
      for (var i = 1, count = tableObj[key].length; i < count; i++) {
        item = tableObj[key][i];
        if (typeof item === 'object') {
          subKey = Object.keys(item);
          valOperator = this._TableConstraints[subKey];
          inputString += ' ' + valOperator + item[subKey];
        } else {
          inputString += ' ' + this._TableConstraints[item];
        }
      }
    }
    inputString += ', ';
  }
  // check to see if _id already provided
  if (inputString.indexOf('_id') === -1) {
    startString += '_id serial primary key,';
  }

  this.inputString = startString + inputString + " created_at TIMESTAMP default now()); " +
  "CREATE OR REPLACE FUNCTION notify_trigger_" + this.table + "() RETURNS trigger AS $$" +
  "BEGIN" +
  " IF (TG_OP = 'DELETE') THEN " +
  "PERFORM pg_notify('notify_trigger_" + this.table + "', '[{' || TG_TABLE_NAME || ':' || OLD._id || '}, { operation: " +
  "\"' || TG_OP || '\"}]');" +
  "RETURN old;" +
  "ELSIF (TG_OP = 'INSERT') THEN " +
  "PERFORM pg_notify('notify_trigger_" + this.table + "', '[{' || TG_TABLE_NAME || ':' || NEW._id || '}, { operation: " +
  "\"' || TG_OP || '\"}]');" +
  "RETURN new; " +
  "ELSIF (TG_OP = 'UPDATE') THEN " +
  "PERFORM pg_notify('notify_trigger_" + this.table + "', '[{' || TG_TABLE_NAME || ':' || NEW._id || '}, { operation: " +
  "\"' || TG_OP || '\"}]');" +
  "RETURN new; " +
  "END IF; " +
  "END; " +
  "$$ LANGUAGE plpgsql; " +
  "CREATE TRIGGER watched_table_trigger AFTER INSERT OR DELETE OR UPDATE ON " + this.table +
  " FOR EACH ROW EXECUTE PROCEDURE notify_trigger_" + this.table + "();";

  this.prevFunc = 'CREATE TABLE';
  return this;
};

// Parameters: none
// SQL: DROP TABLE table
// Special: Deletes cascade
// QUERY/INPUT STRING
ActiveRecord.prototype.dropTable = function () {
  this.inputString = 'DROP TABLE IF EXISTS ' + this.table + ' CASCADE; DROP FUNCTION IF EXISTS notify_trigger_' + this.table + '() CASCADE;';
  this.prevFunc = 'DROP TABLE';
  return this;
};

// Parameters: fields (arguments, optional)
// SQL: SELECT fields FROM table, SELECT * FROM table
// Special: May pass table, distinct, field to obtain a single record per unique value
// STATEMENT STARTER/SELECT STRING
ActiveRecord.prototype.select = function (/*arguments*/) {
  var args = '';
  if (arguments.length >= 1) {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] === 'distinct') {
        args += 'DISTINCT ';
      } else {
        args += arguments[i] + ', ';
      }
    }
    args = args.substring(0, args.length - 2);
  } else {
    args += '*';
  }
  this.selectString = 'SELECT ' + args + ' FROM ' + this.table + " ";
  this.prevFunc = 'SELECT';
  return this;
};

// Parameters: id (optional)
// SQL: SELECT fields FROM table, SELECT * FROM table
// Special: If no idea is passed, may be chained with a where function
// QUERY/INPUT STRING
ActiveRecord.prototype.findOne = function (/*arguments*/) {
  if (arguments.length === 2) {
    this.inputString = 'SELECT * FROM ' + this.table + ' WHERE ' + this.table + '._id = ' + args + ' LIMIT 1;';
  } else {
    this.inputString = 'SELECT * FROM ' + this.table + ' LIMIT 1';
  }
  this.prevFunc = 'FIND ONE';
  return this;
};

// Parameters: join type, fields, join table (all strings or all arrays)
// SQL: JOIN joinTable ON field = field
// Special:
// STATEMENT/JOIN STRING
ActiveRecord.prototype.join = function (joinType, fields, joinTable) {
  if (Array.isArray(joinType)) {
    for (var x = 0, count = fields.length; x < count; x++){
      this.joinString = " " + joinType[x] + " " + joinTable[x][0] + " ON " + this.table + "." + fields[x] + " = " + joinTable[x][0] + "." + joinTable[x][1];
    }
  } else {
    this.joinString = " " + joinType + " " + joinTable + " ON " + this.table + "." + fields + " = " + joinTable + "." + joinTable;
  }
  this.prevFunc = "JOIN";
  return this;
};

// TODO: PARTIALLY COMPLETE -> need to add IN statement if value is an array
// Parameters: string with ?'s followed by an argument for each of the ?'s
// SQL: WHERE field operator comparator, WHERE field1 operator1 comparator1 AND/OR field2 operator2 comparator2
// Special:
// For example:
// db.select('students').where('age = ? and class = ? or name = ?','18','senior','kate').fetch();
ActiveRecord.prototype.where = function (/*Arguments*/) {
  this.dataArray = [];
  var where = '', redux, substring1, substring2;
  where += arguments[0];
  // replace ? with rest of array
  for (var i = 1, count = arguments.length; i < count; i++) {
    redux = where.indexOf('?');
    substring1 = where.substring(0, redux);
    substring2 = where.substring(redux + 1, where.length);
    where = substring1 + '$' + i + substring2;
    this.dataArray.push(arguments[i]);
  }
  this.whereString = ' WHERE ' + where;
  return this;
};

// TODO: COMPLETE
// Parameters: inserts object (req)
// SQL: INSERT INTO table (fields) VALUES (values)
// Special:
ActiveRecord.prototype.insert = function (inserts) {
  var valueString = ') VALUES (', keys = Object.keys(inserts);
  var insertString = 'INSERT INTO ' + this.table + ' (';
  this.dataArray = [];
  // iterate through array arguments to populate input string parts
  for (var i = 0, count = keys.length; i < count;) {
    insertString += keys[i] + ', ';
    this.dataArray.push(inserts[keys[i]]);
    valueString += '$' + (++i) + ', ';
  }
  this.inputString = insertString.substring(0, insertString.length - 2) + valueString.substring(0, valueString.length - 2) + ');';
  this.prevFunc = 'INSERT';
  return this;
};

// TODO: PARTIALLY COMPLETE, NEEDS TESTING
// Parameters: updates object (req)
// SQL: UPDATE table SET (fields) = (values)
// Special:
ActiveRecord.prototype.update = function (updates) {
  var updateField = '(', updateValue = '(', keys = Object.keys(updates);
  if (keys.length > 1) {
    for (var i = 0, count = keys.length - 1; i < count; i++) {
      updateField += keys[i] + ', ';
      updateValue += "'" + updates[keys[i]] + "', ";
    }
    updateField += keys[keys.length - 1];
    updateValue += "'" + updates[keys[keys.length - 1]] + "'";
  } else {
    updateField += keys[0];
    updateValue += "'" + updates[keys[0]] + "'";
  }
  this.updateString = 'UPDATE ' + this.table + ' SET ' + updateField + ') = ' + updateValue + ')';
  this.prevFunc = 'UPDATE';
  return this;
};

// TODO: COMPLETE
// Parameters: none
// SQL: DELETE FROM table
// Special: May be chained with where, otherwise will remove all rows from table
ActiveRecord.prototype.remove = function () {
  this.deleteString = 'DELETE FROM ' + this.table;
  this.prevFunc = 'DELETE';
  return this;
};

// TODO: COMPLETE
// Parameters: limit integer
// SQL: LIMIT number
ActiveRecord.prototype.limit = function (limit) {
  this.limitString = ' LIMIT ' + limit;
  return this;
};

// TODO: COMPLETE
// Parameters: offset integer
// SQL: OFFSET number
ActiveRecord.prototype.offset = function (offset) {
  this.caboose += ' OFFSET ' + offset;
  return this;
};

// TODO: COMPLETE
// Parameters: limit (optional, defaults to 1)
// SQL: SELECT * FROM table ORDER BY table._id ASC LIMIT 1, SELECT * FROM table ORDER BY table._id ASC LIMIT limit
// Special: Retrieves first item, overrides all other chainable functions
ActiveRecord.prototype.first = function (limit) {
  limit = limit || 1;
  this.inputString += 'SELECT * FROM ' + this.table + ' ORDER BY ' + this.table + '._id ASC LIMIT ' + limit + ';';
  this.prevFunc = 'FIRST';
  return this;
};

// TODO: COMPLETE
// Parameters: limit (optional, defaults to 1)
// SQL: SELECT * FROM table ORDER BY table._id DESC LIMIT 1, SELECT * FROM table ORDER BY table._id DESC LIMIT limit
// Special: Retrieves first item, overrides all other chainable functions
ActiveRecord.prototype.last = function (limit) {
  limit = limit || 1;
  this.inputString += 'SELECT * FROM ' + this.table + ' ORDER BY ' + this.table + '._id DESC LIMIT ' + limit + ';';
  this.prevFunc = 'LAST';
  return this;
};

// TODO: COMPLETE
// Parameters: limit (optional, defaults to 1)
// SQL: SELECT * FROM table LIMIT 1, SELECT * FROM table LIMIT limit
// Special: Retrieves a record without ordering, overrides all other chainable functions
ActiveRecord.prototype.take = function (limit) {
  limit = limit || 1;
  this.inputString += 'SELECT * FROM ' + this.table + ' LIMIT ' + limit + ';';
  this.prevFunc = 'TAKE';
  return this;
};

// TODO: INCOMPLETE
// Parameters:
// SQL: GROUP BY
// Special:
ActiveRecord.prototype.group = function () {
  var args = '';
  if (arguments.length >= 1) {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] === 'distinct') {
        args += 'DISTINCT ';
      } else {
        args += arguments[i] + ', ';
      }
    }
    args = args.substring(0, args.length - 2);
  } else {
    args += '';
  }
  this.caboose += 'GROUP BY ' + args;
  return this;
};

ActiveRecord.prototype.order = function () {
  this.orderString = '';
  var args = '';
  if (arguments.length >= 1) {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] === 'distinct') {
        args += 'DISTINCT ';
      } else {
        args += arguments[i] + ', ';
      }
    }
    args = args.substring(0, args.length - 2);
  } else {
    args += '';
  }
  this.orderString += 'ORDER BY ' + args;
  return this;
};

// TODO: INCOMPLETE
// Parameters:
// SQL: HAVING
// Special:
ActiveRecord.prototype.having = function () {
  //this.caboose +=
  return this;
};

// TODO: COMPLETE
// Parameters: None
// SQL: Combines previously chained items to create a SQL statement
// Special: Functions with an inputString override other chainable functions because they are complete
ActiveRecord.prototype.fetch = function (cb) {
  var cb = cb || function(prevFunc, table, results) {return console.log("results in " + prevFunc + ' ' + table, results.rows)};
  var table = this.table;
  var dataArray = this.dataArray;
  var prevFunc = this.prevFunc;
  var input = this.inputString.length > 0 ? this.inputString : this.selectString + this.joinString + this.whereString + this.orderString + this.limitString + ';';
  console.log('FETCH:', input, dataArray);
  pg.connect(this.conString, function (err, client, done) {
    if (err) {
      console.log(err);
    }
    //console.log(input);
    client.query(input, dataArray, function (error, results) {
      if (error) {
        console.log("error in " + prevFunc + ' ' + table, error);
      } else {
        cb(prevFunc, table, results);
      }
      done();
    });
  });
};

ActiveRecord.prototype.save = function (cb) {
  var input = this.inputString.length > 0 ? this.inputString : this.updateString + this.deleteString + this.joinString + this.whereString + ';';
  var dataArray = this.dataArray;
  var prevFunc = this.prevFunc;
  var table = this.table;
  this.inputString = '';
  this.updateString = '';
  this.deleteString = '';
  this.joinString = '';
  this.whereString = '';
  this.dataArray = [];
  var callback = function (err, results) {
      console.log(err, results);
    };
  console.log('SAVE:', input, dataArray);
  pg.connect(this.conString, function (err, client, done) {
    if (err) {
      console.log(err, "in " + prevFunc + ' ' + table);
    }
    client.query(input, dataArray, function (error, results) {
      // callback(error, results);
      if (cb) { cb(error, results); }
    });
    done();
  });
};



ActiveRecord.prototype.createRelationship = function(relTable, relationship){
  if (relationship === "$onetomany"){
    this.inputString += "ALTER TABLE " +  this.table + " ADD " + relTable +
    "_id INTEGER references " + relTable + "(_id);";
  }
  else {
    this.inputString += "CREATE TABLE IF NOT EXISTS" +
    this.table + relTable + " (" + this.table + "_id integer references " + this.table + "(_id), " +
    relTable + "_id integer references " + relTable + "(_id), " +
    "PRIMARY KEY(" + this.table + "_id, " + relTable + "_id)); ";
    this.inputString +=  "CREATE OR REPLACE FUNCTION " + this.table + relTable + "() RETURNS trigger AS $$ " +
    "BEGIN DELETE FROM " + this.table + relTable + " WHERE TG_TABLE_NAME || _id = OLD._id; " +
    "RETURN old; " +
    "END; " +
    "$$ LANGUAGE plpgsql; ";
    this.inputString += "CREATE TRIGGER " + this.table+relTable  + " AFTER DELETE ON " + this.table +
    " FOR EACH ROW EXECUTE PROCEDURE " + this.table + relTable + "(); ";
    this.inputString += "CREATE TRIGGER " + this.table+relTable  + " AFTER DELETE ON " + relTable +
    " FOR EACH ROW EXECUTE PROCEDURE " + this.table + relTable + "(); ";
  }
  console.log(this.inputString);
  return this;
};

ActiveRecord.prototype.autoSelect = function(sub) {

  // We need a dedicated client to watch for changes on each table. We store these clients in
  // our clientHolder and only create a new one if one does not already exist
  var conString = this.conString;
  var table = this.table;
  var prevFunc = this.prevFunc;
  var newWhere = this.whereString;
  var newSelect = newSelect || this.selectString;
  var newJoin = newJoin || this.selectString;

  //console.log(this.inputString);
  //console.log(this.selectString);
  //console.log(this.joinString);
  //console.log(this.whereString);
  //console.log(this.orderString);
  //console.log(this.autoSelectInput);
  this.autoSelectInput = this.autoSelectInput !== "" ? this.autoSelectInput : this.selectString + this.joinString + newWhere + this.orderString + this.limitString + ';';
  this.autoSelectData = this.autoSelectData !== "" ? this.autoSelectData  : this.dataArray;
  //console.log('auto:', this.autoSelectInput, this.autoSelectData);
  var value = this.autoSelectInput;


  var loadAutoSelectClient = function(name, cb){
    // Function to load a new client, store it, and then send it to the function to add the watcher
    //console.log("Loading new client for autoSelect");
    var context = this;
    pg.connect(conString, function(err, client, done) {
      clientHolder[name] = client;
      cb(client);
    });
  };

  var autoSelectHelper = function(client){
    // Selecting all from the table
    //console.log(value);
    client.query(value, function(error, results) {
      if (error) {
        console.log(error, "in autoSelect top")
      } else {
        sub._session.send({
          msg: 'added',
          collection: sub._name,
          id: sub._subscriptionId,
          fields: {
            reset: false,
            results: results.rows
          }
        });
      }
    });
    // Adding notification triggers
    var query = client.query("LISTEN notify_trigger_" + table);
    client.on('notification', function(msg) {
      var returnMsg = eval("(" + msg.payload + ")");
      var k = sub._name;
      if (returnMsg[1].operation === "DELETE") {
        var tableId = parseInt(returnMsg[0][k]);
        sub._session.send({
          msg: 'changed',
          collection: sub._name,
          id: sub._subscriptionId,
          index: tableId,
          fields: {
            removed: true,
            reset: false,
            tableId:tableId
          }
        });
      }
      else if (returnMsg[1].operation === "UPDATE") {
        var selectString1 = newJoin + " WHERE " + table + "._id = " + returnMsg[0][table];
        client.query(selectString1, this.autoSelectData, function(error, results) {
          if (error) {
            //console.log(error, "in autoSelect update");
          } else {
            //console.log(results.rows[0]);
            sub._session.send({
              msg: 'changed',
              collection: sub._name,
              id: sub._subscriptionId,
              index: tableId,
              fields: {
                modified: true,
                removed: false,
                reset: false,
                results: results.rows[0]
              }
            });
          }
        });
      }
      else if (returnMsg[1].operation === "INSERT") {
        //console.log(newSelect, 'select string');
        //console.log(newJoin, 'join string');
        var selectString1 = newJoin + " WHERE " + table + "._id = " + returnMsg[0][table];
        //var selectString = selectStatement(name, properties, {_id: {$eq: returnMsg[0][sub._name]}}, optionsObj, joinObj);
        client.query(selectString1, this.autoSelectData, function(error, results) {
          //console.log("insert", selectString);
          if (error) {
            //console.log("========================", selectString1);
            //console.log(error, "in autoSelect insert")
          } else {
            sub._session.send({
              msg: 'changed',
              collection: sub._name,
              id: sub._subscriptionId,
              fields: {
                removed: false,
                reset: false,
                results: results.rows[0]
              }
            });
          }
        });
      }
    });
  };

  // Checking to see if this table already has a dedicated client before adding the listers
  if(clientHolder[table]){
    autoSelectHelper(clientHolder[table]);
  } else{
    loadAutoSelectClient(table, autoSelectHelper);
  }

};