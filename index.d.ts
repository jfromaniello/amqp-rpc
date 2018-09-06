import { Channel, Connection } from '@types/amqplib';

export interface AMQPRPCServer {
  disconnect(): Promise<void>;
  new(connection: Connection);
}
