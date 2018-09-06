import { Channel, Connection, Options as AMQPOptions } from '@types/amqplib';

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

export interface AMQPRPCServer {
  new(connection: Connection, params?: Options.Server);

  disconnect(): Promise<void>;
  start(): Promise<void>;
  addCommand(command: string, cb: Function);
  requestsQueue(): string;
}

export interface AMQPRPCClient {
  new(connection: Connection, params: Options.Client)

  disconnect(): Promise<void>;
  start(): Promise<void>;
  TIMEOUT(): number;
  repliesQueue(): string;

  sendCommand(command: string,
    args?: Array,
    messageOptions?: AMQPOptions.Publish): Promise<any>
}
