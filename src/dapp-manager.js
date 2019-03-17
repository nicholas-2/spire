const schemas = require('./schemas.js')
const matcher = require('match-schema');
const {VM} = require('vm2');  // Secure version of vm

const dappTimeout = parseInt(process.env.DAPP_TIMEOUT) || 200;
const useSandbox = !(process.env.USE_SANDBOX === 'false');
if(!useSandbox) {
  console.log('WARNING: Sandbox mode is disabled. Only use this if running trusted DApps. If you run untrusted DApps with USE_SANDBOX=true you are vulnerable to a hack!!!');
}
let useWhitelist = false;
let whitelist = [];
if(process.env.WHITELIST) {
  useWhitelist = true;
  whitelist = process.env.WHITELIST.split(',').map(x => x.trim().toLowerCase());
}


// Executes a transaction in a DApp with given data. Returns an array, where
// the first element is the resulting storage and the second is whether a
// deprovision should occur.
async function executeDapp(storage, source, type, func, args, sender, block, blockNum) {
  try {
    const msg = {
      type: type,
      func: func,
      args: args,
      sender: sender,
      block: block,
      blockNumber: blockNum
    };

    if(useSandbox) {
      const vm = new VM({
        timeout: dappTimeout,
        sandbox: {
          storage: storage,
          msg: msg
        }
      });
      return [vm.run('(function() { '+source+'})()'), false];
    } else {
      const dapp = new Function('storage', 'msg', source);
      return [dapp(storage, msg), false];
    }
  } catch(err) { // If fails (likely due to timeout), then deprovision.
    console.log('Error executing DApp, deprovisioning due to error', err);
    return [storage, true];
  }
}

function deprovision(dapp, dapps) {
  console.log('DApp', dapp, 'deprovisioned.');
  dapps[dapp].provisioned = false;
  return dapps;
}

module.exports = {
  // create_dapp actually both creates the DApp and creates an init transaction.
  // This means that DApp creators can set certain properties on initialization
  // such as DApp ownership roles, etc.
  createDapp: async function(json, from, block, blockNum, getDapps, setDapps) {
    const {matched,errorKey} = matcher.match(json, schemas.create);
    if(matched) {
      let dapps = getDapps();
      if(!dapps[json.id]) {
        if(!useWhitelist || whitelist.indexOf(json.id) !== -1) {
          dapps[json.id] = {
            source: json.source,
            storage: {},
            provisioned: true
          }
          console.log(from, 'created DApp', json.id);

          // Init transaction here
          const result = await executeDapp({}, json.source, 'init', '', json.args, from, block, blockNum);
          dapps[json.id].storage = result[0];

          if(result[1]) {  // If fails, then deprovision DApp.
            dapps = deprovision(json.id, dapps);
          }

          setDapps(dapps);
        }
      } else {
        console.log(from, 'failed to create DApp, DApp with same id already exists');
      }
    } else {
      console.log(from, 'failed to create DApp, error at', errorKey);
    }
  },

  transact: async function(json, from, block, blockNum, getDapps, setDapps) {
    const {matched,errorKey} = matcher.match(json, schemas.transact);
    if(matched) {
      let dapps = getDapps();
      if(dapps[json.id] && dapps[json.id].provisioned) {
        const dapp = dapps[json.id];
        const result = await executeDapp(dapp.storage, dapp.source, 'transaction', json.func, json.args, from, block, blockNum);
        dapps[json.id].storage = result[0];

        if(result[1]) {  // If fails, then deprovision DApp.
          dapps = deprovision(json.id, dapps);
        }

        setDapps(dapps);
      }
    } else {
      console.log(from, 'failed to tranasact to DApp, error at', errorKey);
    }
  },

  view: async function(id, func, args, getDapps) {
    const dapps = getDapps();
    if(dapps[id] && dapps[id].provisioned) {
      const dapp = dapps[id];
      const result = await executeDapp(dapp.storage, dapp.source, 'view', func, args);
      if(result[1]) {
        return {
          error: 'ExecutionError'
        }
      } else {
        return {
          result: result[0]
        }
      }
    } else {
      return {
        error: 'NonexistentDappError'
      }
    }
  }
}
