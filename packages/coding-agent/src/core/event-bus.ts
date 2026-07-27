import { EventEmitter } from "node:events";

export interface ExtensionEventMap {
	[channel: string]: unknown;
}

export type ExtensionEventName = keyof ExtensionEventMap & string;

export type KnownEventName = keyof { [K in keyof ExtensionEventMap as string extends K ? never : K]: true };

export interface EventBus {
	emit<K extends ExtensionEventName>(channel: K, data: ExtensionEventMap[K]): void;
	on<K extends ExtensionEventName>(channel: K, handler: (data: ExtensionEventMap[K]) => void): () => void;
}

export interface EventBusController extends EventBus {
	clear(): void;
}

export function createEventBus(): EventBusController {
	const emitter = new EventEmitter();
	return {
		emit(channel: string, data: unknown) {
			emitter.emit(channel, data);
		},
		on(channel: string, handler: (data: unknown) => void) {
			const safeHandler = async (data: unknown) => {
				try {
					await handler(data);
				} catch (err) {
					console.error(`Event handler error (${channel}):`, err);
				}
			};
			emitter.on(channel, safeHandler);
			return () => emitter.off(channel, safeHandler);
		},
		clear() {
			emitter.removeAllListeners();
		},
	};
}
