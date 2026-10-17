# Sealdrop demo narration

Spoken words only. One sentence per line, under a story step (`##`) and, in the live demo, a beat (`###`).
`scripts/video/` reads this file; edit a line and run the build command from `VIDEO-NOTES.md` to re-voice and re-render.
Only claims that are true of the built app (README, `arkiv/`, `evidence/`) belong here.

## 1. The problem
Privacy starts with a source who knows something the public should hear, but can only say it safely by staying unnamed.
SecureDrop answers that with servers, a firewall and air-gapped machines, which a small newsroom may not be able to afford.
And a tip line that runs on a server is one place to seize, subpoena or switch off.

## 2. What Sealdrop is
Sealdrop is an encrypted, self-expiring tip line with no Sealdrop server.
A source seals a message in the browser, and only the newsroom's key can open it.
In between it is ciphertext in Arkiv, the Web3 database, and each tip expires on the date its source chose.
The inbox is a lease too: if the newsroom stops renewing it, it lapses.

## 3. Live demo
### create
Let's try it live on the Tiramisu testnet.
We create a throwaway newsroom, a fresh keypair made in this browser, and then an inbox: one Arkiv entity with a seven-day lease.
### copy
Copy the inbox link, and open it as a source in a second window.
### verify
The source's page first verifies the inbox on Arkiv: its creator, its owner, and its lease.
### send
We type a made-up tip and send.
It is sealed in the browser first, so only ciphertext goes to Arkiv.
### arrive
A moment later it appears in the newsroom, pushed over a WebSocket.
Nothing polls, and the newsroom's key opens it locally.
### lease
The tip carries the lease its source chose, and its owner is now the newsroom, handed over in the same transaction.
### receipt
The receipt shows exactly what Arkiv stores: the creator, the owner, three attributes, and the sealed payload.
### explorer
In the public explorer, the same entity: ciphertext, a few attributes, and in demo mode nothing that says who wrote it.

## 4. How it uses Arkiv
The inbox and every tip are Arkiv entities, found by typed attributes and range queries.
Entity Expiration enforces each lease in the protocol, not in a server's promise.
Creator and owner are protocol fields: the page uses the creator to reject look-alike inboxes, and the owner to hand each tip to the newsroom.
Lifetime Extension renews the inbox, and an event subscription feeds the live view.
Private keys and plaintext never touch Arkiv.

## 5. Honest limits
It is honest about its limits.
It does not hide your network address, so use Tor Browser, and ciphertext stays in chain history after a tip expires.
It is a testnet prototype, and the friction we hit building on Arkiv is written up in arkiv/friction.md.
The code and the live app are linked here.
