import type { z } from "zod";
import { ipcContract, type IpcChannel } from "../schemas/ipc";

export type IpcInput<TChannel extends IpcChannel> = z.input<(typeof ipcContract)[TChannel]["input"]>;
export type IpcOutput<TChannel extends IpcChannel> = z.output<(typeof ipcContract)[TChannel]["output"]>;

