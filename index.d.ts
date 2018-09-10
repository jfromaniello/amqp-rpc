import { Channel, Connection, Options as AMQPOptions } from 'amqplib';

export namespace Options {
  export interface Server {
    requestsQueue: string;
    verifyReplyQueue?: boolean;
    prefetchCount?: string;
  }

  export interface Client {
    requestsQueue: string;
    repliesQueue?: string;
    timeout?: number;
    defaultMessageOptions?: AMQPOptions.Publish;
    consumeOptions?: AMQPOptions.Consume;
  }

}

declare class AMQPRPCServer {
  constructor(connection: Connection, params?: Options.Server);

  disconnect(): Promise<void>;
  start(): Promise<void>;
  addCommand(command: string, cb: Function): AMQPRPCServer;
  requestsQueue(): string;
}

declare class AMQPRPCClient {
  constructor(connection: Connection, params: Options.Client);

  disconnect(): Promise<void>;
  start(): Promise<void>;
  TIMEOUT(): number;
  repliesQueue(): string;

  sendCommand(command: string,
    args?: Array<any>,
    messageOptions?: AMQPOptions.Publish): Promise<any>
}
