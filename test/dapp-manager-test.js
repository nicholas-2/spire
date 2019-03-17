const expect = require('chai').expect;

const dappManager = require('../src/dapp-manager.js');


describe('DApp Manager', function() {
  let dapps;

  function getDapps() {
    return dapps;
  }

  function setDapps(value) {
    dapps = value;
  }

  it('Successfully creates a DApp and executes init', async function() {
    const source = '(function() {return "storage"})()';
    dapps = {};

    await dappManager.createDapp({
      id: 'test',
      args: [],
      source: source
    }, 'alice', {}, 100, getDapps, setDapps);

    expect(dapps.test.source).to.equal(source);
    expect(dapps.test.storage).to.equal('storage');
  });

  it('Runs a transaction with the correct context data', async function() {
    // We'll just set the storage to the context data so that we can easily tell
    // the context data is right.
    const source = '(function() {storage.msg = msg; return storage;})()';
    dapps = {
      test: {
        id: 'test',
        source: source,
        storage: {},
        provisioned: true
      }
    };

    await dappManager.transact({
      id: 'test',
      args: ['arg1', 'arg2'],
      func: 'func'
    }, 'alice', 'block-here', 50, getDapps, setDapps);

    const storage = dapps.test.storage;
    expect(storage.msg.type).to.equal('transaction');
    expect(storage.msg.func).to.equal('func');
    expect(storage.msg.args[0]).to.equal('arg1');
    expect(storage.msg.sender).to.equal('alice');
    expect(storage.msg.blockNumber).to.equal(50);
    expect(storage.msg.block).to.equal('block-here');
  });

  it('Errors cause deprovisionment', async function() {
    // Here we throw an error on purpose to see if it correctly deprovisions
    const source = 'require("vm2")';
    dapps = {
      test: {
        id: 'test',
        source: source,
        storage: 'storage-here',
        provisioned: true
      }
    };

    await dappManager.transact({
      id: 'test',
      args: ['arg1', 'arg2'],
      func: 'func'
    }, 'alice', 'block-here', 50, getDapps, setDapps);

    expect(dapps.test.provisioned).to.be.false;
  });

  it('Timeout causes deprovisionment', async function() {
    // Here we timeout on purpose to see if it correctly deprovisions.
    const source = '(function() {while(true) {storage = "storage-here";} return storage;})()';
    dapps = {
      test: {
        id: 'test',
        source: source,
        storage: 'storage-here',
        provisioned: true
      }
    };

    await dappManager.transact({
      id: 'test',
      args: ['arg1', 'arg2'],
      func: 'func'
    }, 'alice', 'block-here', 50, getDapps, setDapps);

    expect(dapps.test.provisioned).to.be.false;
  });

  it('Does not run a transaction on a deprovisioned DApp', async function() {
    const source = '5'; // simple test source
    dapps = {
      test: {
        id: 'test',
        source: source,
        storage: {},
        provisioned: false
      }
    };

    await dappManager.transact({
      id: 'test',
      args: ['arg1', 'arg2'],
      func: 'func'
    }, 'alice', 'block-here', 50, getDapps, setDapps);

    expect(dapps.test.storage).to.be.an.instanceof(Object);
  });

  it('Executes views in the correct context', async function() {
    const source = "(function() {if(msg.type === 'init') {return 'initialization'} else if(msg.type === 'transaction') {return 'transaction';} else if(msg.type === 'view') {return msg;}})()";
    dapps = {
      test: {
        id: 'test',
        source: source,
        storage: 'starting-storage',
        provisioned: true
      }
    };

    const result = await dappManager.view('test', 'func-here', ['arg1', 'arg2'], getDapps);

    expect(dapps.test.storage).to.equal('starting-storage');
    expect(result.error).to.not.exist;
    expect(result.result.type).to.equal('view');
    expect(result.result.func).to.equal('func-here');
    expect(result.result.args[0]).to.equal('arg1');
  });
});
