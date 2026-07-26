export async function copyToClipboard(text: string): Promise<void> {
	// OSC 52 works over SSH and inside containers; the terminal owns the clipboard.
	const encoded = Buffer.from(text).toString("base64");
	process.stdout.write(`\x1b]52;c;${encoded}\x07`);
}
