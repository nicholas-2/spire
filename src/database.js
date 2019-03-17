/*
  database.js
  ===

  This module controls the connection to the database which hosts persistent data
  such as saving the DApp states, DApp source code, and global state. It uses
  Sequelize to provide an ORM that supports a variety of SQl-based databases:
  PostgreSQL, MySQL, MSSQL, and SQLite.
*/

const Sequelize = require('sequelize');
const fs = require('fs');

const dbLocation = __dirname + '/../database.db'; // In case a SQLite DB is chosen
let logging = false;

if(process.env.LOG_QUERIES) {
  logging = console.log;
}

const dbHost = process.env.DB_HOST;
const dbUsername = process.env.DB_USER;
const dbPassword = process.env.DB_PASS;
const dbName = process.env.DB_NAME;
const dbDialect = process.env.DB_DIALECT; // Which type of DB to use, can be
                                          // postgres, mysql, sqlite and mssql

if(!fs.existsSync(dbLocation)) {
  const createStream = fs.createWriteStream(dbLocation);
  createStream.end();
}

const sequelize = new Sequelize(dbName, dbUsername, dbPassword, {
  host: dbHost,
  dialect: dbDialect,

  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },

  // SQLite only
  storage: dbLocation,

  logging: logging,
  operatorsAliases: false
});

console.log('Establishing connection to', dbDialect, 'db.');
sequelize
  .authenticate()
  .then(() => {
    console.log('DB connection has been established successfully.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

// For storing global state, currently only stores the current block.
const State = sequelize.define('state', {
  block: Sequelize.INTEGER
});

const Dapp = sequelize.define('dapp', {
  id: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  source: Sequelize.STRING,
  storage: Sequelize.STRING,
  provisioned: Sequelize.BOOLEAN
});

module.exports = {
  setup: async function(startBlock) {
    await sequelize.sync();
    let result = await State.findOrCreate({
      where: {},
      order: [['block', 'DESC']], // Just in case there are multiple state entries, then we just get the latest one.
      limit: 1,
      defaults: {
        block: startBlock
      }
    });

    const state = result[0].dataValues;
    const created = result[1];

    if (created) {
      console.log('No state entry found, starting with genesis block and state.');
    }

    result = await Dapp.findAll({
      where: {}
    });

    const dapps = {};

    for(let i in result) {
      const dapp = result[i].dataValues;
      dapp.storage = JSON.parse(dapp.storage);
      dapps[result[i].dataValues.id] = dapp;
    }

    return [state, dapps];
  },

  save: async function(dapps, block) {

    // Save state by updating the only one in existence.
    let result = await State.findOne({
       where: {}
    });

    if (result) {
      await result.update({
        block: block
      });
    } else {
      console.log('Error saving state: state not correctly created in DB?')
    }

    for(id in dapps) {
      const dapp = dapps[id];
      const result = await Dapp.findOrCreate({
        where: {
          id: id
        },
        defaults: {
          source: dapp.source,
          storage: JSON.stringify(dapp.storage),
          provisioned: dapp.provisioned
        }
      });
      const entry = result[0];
      const created = result[1];

      if (!created) {   // If dapp not created in previous step then update it
        await entry.update({
          source: dapp.source,
          storage: JSON.stringify(dapp.storage),
          provisioned: dapp.provisioned
        });
      }
    }
  }
};
