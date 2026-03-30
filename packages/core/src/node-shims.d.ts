declare module 'node:fs/promises' {
  export function mkdir(
    path: string,
    options?: {
      recursive?: boolean;
    }
  ): Promise<void>;

  export function writeFile(
    path: string,
    data: string,
    encoding: string
  ): Promise<void>;
}

declare module 'node:path' {
  export function dirname(path: string): string;
}

declare module 'node:net' {
  export interface Socket {
    setEncoding(encoding: string): this;
    on(event: 'data', listener: (chunk: string) => void | Promise<void>): this;
  }

  export interface Server {}

  export function createServer(connectionListener?: (socket: Socket) => void): Server;

  const net: {
    createServer: typeof createServer;
  };

  export default net;
}
