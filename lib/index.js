var net = require('net');
var events = require('events');
var zmq = require('zeromq');
var sock = zmq.socket('pub');
require('./algoProperties.js');
var pool = require('./pool.js');

exports.daemon = require('./daemon.js');
exports.varDiff = require('./varDiff.js');

// validate args
if(process.argv.length < 3) {
    console.log("Error: Config file argument required. Good bye ..");
    process.exit(1);
}

var createPool = function (poolOptions, authorizeFn) {
    var newPool = new pool(poolOptions, authorizeFn);
    return newPool;
};

// load config
var config = require(process.argv[2]);

// connect to publisher socket
sock.bindSync(config.publisherSocket);
console.log('Connected to ZMQ socket ' + config.publisherSocket);

// create pool
var pool = createPool(config, function (ip, port, workerName, password, callback) { //stratum authorization function
    console.log("Authorize " + workerName + ":" + password + "@" + ip);
    callback({
        error: null,
        authorized: true,
        disconnect: false
    });
});

pool.on('log', function (severity, logText) {
    console.log(severity + ': ' + logText);
});

// monitor shares
pool.on('share', function (isValidShare, isValidBlock, data) {
    if (isValidBlock)
        console.log('Pool ' + config.publisherTopic + ' found block ' + data.height);
    else if (isValidShare)
        console.log('Valid share submitted');
    else if (data.blockHash)
        console.log('We thought a block was found but it was rejected by the daemon');
    else
        console.log('Invalid share submitted')

    if(isValidShare) {
        var minerWorker = data.worker.split(".");

        // transform it
        var share = {
            difficulty: data.difficulty,
            networkDifficulty: data.blockDiff,
            blockHeight: data.height,
            blockReward: data.blockReward / 100000000,
            miner: minerWorker[0],
            worker: minerWorker[1],
            ipAddress: data.ip,
            isBlockCandidate: isValidBlock && data.txHash != null,
            blockHex: data.blockHex,
            blockHash: data.blockHash,
            transactionConfirmationData: data.txHash,
            userAgent: '',
            payoutInfo: '' // monero only
        };

        // publish
        sock.send([config.publisherTopic, JSON.stringify(share)]);
    }
});

pool.start();
