# Local printing and device routing

## Browser and agent fallback

The web component should send a structured payload to the local agent with a short timeout. If receipt printing cannot reach the agent, render the same payload into a dedicated print area and call browser printing. Avoid duplicate output: fallback only after a confirmed agent failure.

## Windows USB discovery

Installed queues are not the same as connected devices. Queue `Status` and `WorkOffline` can be stale for USB thermal printers.

A robust agent can:

1. enumerate present `USBPRINT` Plug and Play device nodes;
2. read each present device's current `PortName`;
3. map the active port to installed printer queues;
4. classify the matching queue using model/driver identity or explicit capability metadata;
5. return no target rather than printing a receipt on a label printer or a barcode on a receipt printer.

Re-evaluate on every job or connection change; do not permanently equate `USB003` with receipts or barcodes.

## Diagnosis

- Health/list endpoints should expose installed, connected, receipt-target, and barcode-target views separately.
- A successful renderer or `StartDoc` call can still leave a retained error job. Inspect the queue and PrintService event log.
- Driver or port-monitor errors such as a missing DLL require repairing/reinstalling the Windows driver or restarting the spooler with appropriate privileges; application code cannot truthfully mask them.
- Keep a preview image when no physical target exists so rendering can be verified independently.

## Receipts and labels

Receipts need readable RTL text, totals, item rows, identity, timestamp, and operation number. Labels need exact dimensions, scannable contrast, unmodified barcode value, variant attributes when useful, and exact quantities.
