# About

This application shall demo [eip-712](https://eips.ethereum.org/EIPS/eip-712) in order to investigate how various wallets render signing requests.
It implements a minimal Dapp (web UI) which allows to connect a wallet (browser injected or using wallet connect / reown).

The application is focused on simplicity - both from a user's perspective and from a codebase perspective.
It uses libs/frameworks commonly used for modern web3 apps.
The codebase is in typescript.

## Permit

A first showcase is [ERC20 permit](https://eips.ethereum.org/EIPS/eip-2612).
The user can enter a token address, amount and recipient. Clicking a "sign" button triggers a wallet action for signing the corresponding message.
The resulting signature is then printed on the page.

# General coding guidelines

Less code is better. Always try to achieve the goal with the least amount of code possible.
Always question what's already there. Don't assume that pre-existing code is worth keeping, that previously made architectural decisions are correct. If you think they are not, change/delete/rewrite. If the change you have in mind seems drastic, you may ask for confirmation before doing it.
When made aware of an issue and not very confident that the proposed fix will be the solution, immediately add enough debug output to make sure the problem is sufficiently understood to be well solved in at most 2 iterations.