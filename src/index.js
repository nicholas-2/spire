const steem = require('dsteem');
const steemState = require('steem-state');
const steemTransact = require('steem-transact');
const readline = require('readline');
const jayson = require('jayson'); // For JSON RPC server
const fs = require('fs');

const dappManager = require('./dapp-manager.js');
const database = require('./database.js');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const stateStoreFile = './state.json';

const client = new steem.Client('https://api.steemit.com');
let processor;

let dapps = { // Stores DApp data

};

const genesisBlock = parseInt(process.env.START_BLOCK) || 31239400;
const key = process.env.KEY || '';
const username = process.env.ACCOUNT || '';
const port = process.env.PORT || 3000;
const streamMode = process.env.STREAM_MODE || 'latest';

const prefix = 'spire_';

/*
  These two helper functions, getDapps and setDapps are used to pass to the
  dapp manager to provide an interface to the data in this module.
*/
function getDapps() {
  return dapps;
}

function setDapps(value) {
  dapps = value;
}

function startApp(state) {
  processor = steemState(client, steem, state.block, 0, prefix, streamMode);

  processor.onBlock(async function(num, block) {
    if(num % 100 === 0 && !processor.isStreaming()) {
      client.database.getDynamicGlobalProperties().then(function(result) {
        console.log('At block', num, 'with', result.head_block_number-num, 'left until real-time.')
      });
    }

    if(num % 100 === 0) {
      saveState(num, function() {
        console.log('Saved state.')
      });
    }

    // Since steem-state doesn't provide block data such as witness, block
    // number, etc (used as random seed in some dapps), we parse the block independently
    // and use steem-state only for syncing logic. Some of this code is copied from steem-state source

    var transactions = block.transactions;

    for(var i = 0; i < transactions.length; i++) {
      for(var j = 0; j < transactions[i].operations.length; j++) {

        var op = transactions[i].operations[j];
        if(op[0] === 'custom_json') {
          if(op[1].id === prefix + 'transact') {
            await dappManager.transact(JSON.parse(op[1].json), op[1].required_posting_auths[0], block, num, getDapps, setDapps);
          } else if(op[1].id === prefix + 'dapp_create') {
            await dappManager.createDapp(JSON.parse(op[1].json), op[1].required_posting_auths[0], block, num, getDapps, setDapps);
          }
        }
      }
    }
  });

  processor.onStreamingStart(function() {
    console.log("At real time.")
  });

  processor.start();


  let transactor = steemTransact(client, steem, prefix);

  rl.on('line', function(data) {  // A simple CLI for use in testing and development.
    let split = data.split(' ');

    if(split[0] === 'exit') {
      exit();
    } else if(split[0] === 'state') {
      console.log(JSON.stringify(state,null,2));
      console.log(JSON.stringify(dapps,null,2));
    } else if(split[0] === 'create') {
      const sourceFile = split[2];
      const id = split[1];
      const args = split.slice(3);
      console.log(`Using ${args} as arguments`);

      const source = fs.readFileSync(__dirname + '/../' + sourceFile).toString('utf8');

      transactor.json(username, key, 'dapp_create', {
        id: id,
        source: source,
        args: args
      }, function(err, result) {
        if(err) {
          console.log(err);
        }
      });
    } else if(split[0] === 'transact') {
      const dapp = split[1];
      const func = split[2];
      const args = split.slice(3);

      transactor.json(username, key, 'transact', {
        id: dapp,
        func: func,
        args: args
      }, function(err, result) {
        if(err) {
          console.log(err);
        }
      });
    } else {
      console.log("Invalid command.");
    }
  });

  const server = jayson.server({
    view: function(args, callback) {
      dappManager.view(args[0], args[1], args[2], getDapps).then((result) => {
        callback(null, result);
      });
    },
    status: function(args, callback) {
      callback(null, {
        streaming: processor.isStreaming(),
        mode: streamMode
      });
    }
  });

  server.http().listen(port);

  console.log('Listening on port', port);

  console.log('Spire started.')
}

function exit() {
  console.log('Stopping processor...');
  processor.stop(function() {
    console.log('Stopped processor and saved state...');
    saveState().then(function() {
      console.log('Saved state and exiting...');
      process.exit();
      console.log('Process exited.');
    });
  });
}

function saveState(block,callback) {
  database.save(dapps, block).then(callback);
}

database.setup(genesisBlock).then((result) => {
  dapps = result[1];
  startApp(result[0]);
});
