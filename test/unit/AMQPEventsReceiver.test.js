const assert = require('assert');
const EventEmitter = require('events');

const sinon = require('sinon');
const { expect } = require('chai');

const { AMQPEventsReceiver } = require('../../');

describe('AMQPEventsReceiver', () => {
  let channelStub;
  let connectionStub;

  beforeEach(() => {
    channelStub = {
      assertQueue: sinon.stub().returns(Promise.resolve({})),
      consume: sinon.stub().returns(Promise.resolve()),
      ack: sinon.stub().returns(Promise.resolve()),
      close: sinon.stub().returns(Promise.resolve()),
      deleteQueue: sinon.stub().returns(Promise.resolve())
    };
    connectionStub = {
      createChannel: sinon.stub().returns(Promise.resolve(channelStub))
    };
  });


  it('should be constructable', () => {
    const receiver = new AMQPEventsReceiver(connectionStub);
    expect(receiver).to.be.instanceof(AMQPEventsReceiver);
    expect(receiver).to.be.instanceof(EventEmitter);
    expect(receiver._connection).to.equal(connectionStub);
  });


  describe('#receive', () => {

    it('should trhow if already receiving messages', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      await receiver.receive();
      let caughtError;
      try {
        await receiver.receive();
      } catch (e) {
        caughtError = e;
      }
      expect(caughtError).instanceof(assert.AssertionError);
      expect(caughtError.message).to.equal('Already receiving');
    });

    it('should create amqp channel for work', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      await receiver.receive();
      expect(connectionStub.createChannel).to.have.been.calledOnce;
      expect(receiver._channel).to.equal(channelStub);
    });

    it('should create anonymous amqp queue with autoDelete and durable flags', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      const queueStub = {
        queue: String(Math.random()) + Date.now()
      };
      channelStub.assertQueue = sinon.stub().returns(Promise.resolve(queueStub));
      const queueName = await receiver.receive();
      expect(channelStub.assertQueue).to.have.been.calledOnce
        .and.calledWith('', {
          autoDelete: true,
          durabale: true
        });
      expect(receiver._queue).to.equal(queueStub);
      expect(queueName).to.equal(queueStub.queue);
    });

    it('should start listening from queue', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      let consumerMethod;
      channelStub.consume = (queueName, cb) => {
        consumerMethod = cb;
      };
      sinon.spy(channelStub, 'consume');
      receiver._handleMessage = sinon.stub();
      const queueName = await receiver.receive();
      expect(channelStub.consume).to.have.been.calledOnce
        .and.calledWith(queueName, consumerMethod);

      const msg = {};
      consumerMethod(msg);
      expect(receiver._handleMessage).to.have.been.calledOnce
        .and.calledWith(msg);
    });
  });


  describe('#_handleMessage', () => {

    it('should emit received messages as data events', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      await receiver.receive();
      const data = {
        key: 'value'
      };
      const msg = {
        content: new Buffer(JSON.stringify(data))
      };
      const dataEventHandler = sinon.stub();
      receiver.on('data', dataEventHandler);
      receiver._handleMessage(msg);
      expect(dataEventHandler).to.have.been.calledOnce
        .and.calledWith(data);
    });

    it('should emit ack receinved messages', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      await receiver.receive();
      const data = {
        key: 'value'
      };
      const msg = {
        content: new Buffer(JSON.stringify(data))
      };
      receiver._handleMessage(msg);
      expect(channelStub.ack).to.have.been.calledOnce
        .and.calledWith(msg);
    });

    it('should emit end on queue removal', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      await receiver.receive();
      const endEventHandler = sinon.stub();
      receiver.on('end', endEventHandler);
      receiver._handleMessage(null);
      expect(endEventHandler).to.have.been.calledOnce;
    });

    it('should disconnect on queue removal', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      await receiver.receive();
      receiver.disconnect = sinon.stub();
      receiver._handleMessage(null);
      expect(receiver.disconnect).to.have.been.calledOnce;
    });
  });


  describe('#disconnect', () => {

    it('should emit close event', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      await receiver.receive();
      const closeEventHandler = sinon.stub();
      receiver.on('close', closeEventHandler);
      await receiver.disconnect();
      expect(closeEventHandler).to.have.been.calledOnce;
    });

    it('should do nothing if not listening', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      await receiver.disconnect();
      expect(channelStub.deleteQueue).not.to.be.called;
      expect(channelStub.close).not.to.be.called;
    });

    it('should delete queue', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      const queueName = await receiver.receive();
      await receiver.disconnect();
      expect(channelStub.deleteQueue).to.have.been.calledOnce
        .and.calledWith(queueName);
    });

    it('should not fail if trying to delete nonexistant queue', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      const queueName = await receiver.receive();
      channelStub.deleteQueue = sinon.stub().returns(Promise.reject(new Error('there are no queue')));
      await receiver.disconnect();
      expect(channelStub.deleteQueue).to.have.been.calledOnce
        .and.calledWith(queueName);
      expect(channelStub.close).to.have.been.calledOnce;
    });

    it('should close channel', async () => {
      const receiver = new AMQPEventsReceiver(connectionStub);
      await receiver.receive();
      await receiver.disconnect();
      expect(channelStub.close).to.have.been.calledOnce;
    });
  });
});
