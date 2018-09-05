'use strict';

const chai = require('chai');
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const {expect} = chai;

const {AMQPRPCClient, AMQPRPCServer} = require('../..');
const helpers = require('../helpers.js');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


describe('AMQPServer with prefetchCount = 1', () => {
  let connection;
  let client;
  let server;

  beforeEach(async () => {
    connection = await helpers.getAmqpConnection();
    server = new AMQPRPCServer(connection, { prefetchCount: 1 });
    await server.start();
    client = new AMQPRPCClient(connection, { requestsQueue: server.requestsQueue, timeout: 200 });
    await client.start();
  });

  afterEach(async () => {
    await server.disconnect();
    await client.disconnect();
    await helpers.closeAmqpConnection();
  });

  describe('when client send multiples command before finishing', () => {
    it('should process one command at the time', async () => {
      const results = [];
      let times = 0;
      server.addCommand('command', async () => {
        const i = times++;
        if (i === 0) {
          // first message is slower;
          await sleep(40);
        }
        results.push(i);
      });

      await Promise.all([
          client.sendCommand('command'),
          client.sendCommand('command')
      ]);

      expect(results).to.deep.equal([0, 1]);
    });
  });
});
