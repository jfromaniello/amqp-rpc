const Command = require('./Command');
const CommandResult = require('./CommandResult');
const AMQPEndpoint = require('./AMQPEndpoint');

/**
 * Implementation for an AMQP RPC server.
 *
 * @class
 */
class AMQPRPCServer extends AMQPEndpoint {
  /**
   * Creates a new instance of RPC server.
   *
   * @param {*} connection Connection reference created from `amqplib` library
   *
   * @param {Object} params
   * @param {String} params.requestsQueue queue when AMQPRPC client sends commands, should correspond with AMQPRPCClient
   *    default is '' which means auto-generated queue name
   * @param {Boolean} params.verifyReplyQueue verify that the reply queue exists before handling a request
   * @param {String} params.prefetchCount specifies the number of commands that should be run in parallel
   *    default is 0 which means unlimited
   */
  constructor(connection, params = {}) {
    params.requestsQueue = params.requestsQueue || '';

    super(connection, params);

    this._requestsQueue = params.requestsQueue;
    this._commands = {};
    this._verifyReplyQueue = params.verifyReplyQueue;
    this._prefetchCount = params.prefetchCount || 0;
  }

  /**
   * Initialize RPC server.
   *
   * @returns {Promise}
   * @override
   */
  async start() {
    await super.start();


    if (this._requestsQueue === '') {
      const response = await this._channel.assertQueue('', { exclusive: true });
      this._requestsQueue = response.queue;
    }

    if (this._channel.prefetch && this._prefetchCount !== 0) {
      await this._channel.prefetch(this._prefetchCount);
    }

    const consumeResult = await this._channel.consume(this._requestsQueue, (msg) => this._handleMsg(msg));
    this._consumerTag = consumeResult.consumerTag
  }

  /**
   * Opposite to this.start()
   *
   * @returns {Promise}
   */
  async disconnect() {
    await this._channel.cancel(this._consumerTag);

    if (this._params.requestsQueue === '') {
      await this._channel.deleteQueue(this._requestsQueue);
      this._requestsQueue = '';
    }

    await super.disconnect();
  }

  /**
   * Registers a new command in this RPC server instance.
   *
   * @param {String} command Command name
   * @param {Function} cb Callback that must be called when server got RPC command
   * @returns {AMQPRPCServer}
   */
  addCommand(command, cb) {
    this._commands[command] = cb;

    return this;
  }

  /**
   * @private
   *
   * this is an internal method used to verify if the
   * reply queue still exists by using a disposable channel.
   *
   * Extracted from rabbitmq documentation: https://www.rabbitmq.com/direct-reply-to.html
   *
   * If the RPC server is going to perform some expensive computation
   * it might wish to check if the client has gone away. To do this the
   * server can declare the generated reply name first on a disposable
   * channel in order to determine whether it still exists.
   */
  async _checkQueue(queueName) {
    const channel = await this._connection.createChannel();
    let result = true;
    try {
      //we need to handle this error otherwise it breaks the application
      channel.on('error', () => { result = false; });
      await channel.checkQueue(queueName);
    } catch(err) {
      result = false;
    }
    await channel.close();
    return result;
  }

  /**
   *
   * @private
   */
  async _handleMsg(msg) {

    const replyTo = msg.properties.replyTo;
    const correlationId = msg.properties.correlationId;
    const persistent = msg.properties.deliveryMode !== 1;

    try {
      if (this._verifyReplyQueue) {
        const replyQueueExists = await this._checkQueue(replyTo);
        if (!replyQueueExists) {
          //This means that the client has disposed the reply queue
          //before we finished.
          return;
        }
      }
      const result = await this._dispatchCommand(msg);
      const content = new CommandResult(CommandResult.STATES.SUCCESS, result).pack();
      await this._channel.sendToQueue(replyTo, content, {correlationId, persistent});
      await this._channel.ack(msg);
    } catch (error) {
      if (this._channel) {
        const content = new CommandResult(CommandResult.STATES.ERROR, error).pack();
        await this._channel.sendToQueue(replyTo, content, {correlationId, persistent});
        await this._channel.reject(msg);
      }
    }
  }

  /**
   * Dispatches a command with specified message.
   *
   * @private
   * @param {Object} msg
   */
  _dispatchCommand(msg) {
    const command = Command.fromBuffer(msg.content);

    if (this._commands[command.command] && this._commands[command.command] instanceof Function) {
      return this._commands[command.command].apply(null, command.args);
    }

    throw new Error(`Unknown command ${command.command}`);
  }

  /**
   * Allows to get generated value when params.requestsQueue was set to '' (empty string) or omitted
   * @returns {String} an actual name of the queue used by the instance for receiving replies
   */
  get requestsQueue() {
    return this._requestsQueue;
  }
}

module.exports = AMQPRPCServer;
