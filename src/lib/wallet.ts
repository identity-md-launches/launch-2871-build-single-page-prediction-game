import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import { mainnet } from "wagmi/chains";
import {
  createPublicClient,
  verifyMessage,
  type Address,
  type Hex,
} from "viem";

export const walletConfig = createConfig({
  chains: [mainnet],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "Squeek Streak",
      appLogoUrl: new URL("favicon.svg", document.baseURI).href,
      preference: { options: "all" },
    }),
  ],
  transports: { [mainnet.id]: http("https://ethereum-rpc.publicnode.com") },
});
export interface Login {
  address: Address;
  message: string;
  signature: Hex;
  expires: number;
}
const SESSION_KEY = "squeek-streak:login:v1";
export function loginMessage(address: Address, now: number) {
  const nonce = crypto.randomUUID();
  return `${location.host} wants you to sign in to Squeek Streak with your Ethereum account:\n${address}\n\nPlay with free SP points in this browser’s local league. This signature authorizes no transactions, token approvals, or payments.\n\nURI: ${location.origin}${location.pathname}\nVersion: 1\nNonce: ${nonce}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${new Date(now + 86_400_000).toISOString()}`;
}
export async function verifyLogin(login: Login) {
  if (
    login.expires <= Date.now() ||
    !login.message.includes(`URI: ${location.origin}${location.pathname}\n`)
  )
    return false;
  try {
    if (
      await verifyMessage({
        address: login.address,
        message: login.message,
        signature: login.signature,
      })
    )
      return true;
  } catch {
    /* Smart wallets can use EIP-1271 or counterfactual signatures. */
  }
  const client = createPublicClient({
    chain: mainnet,
    transport: http("https://ethereum-rpc.publicnode.com", {
      timeout: 10_000,
      retryCount: 0,
    }),
  });
  return client.verifyMessage({
    address: login.address,
    message: login.message,
    signature: login.signature,
  });
}
export function readLogin(): Login | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(SESSION_KEY) ?? "null",
    ) as Login | null;
    return value &&
      typeof value.address === "string" &&
      typeof value.message === "string" &&
      typeof value.signature === "string" &&
      Number.isFinite(value.expires)
      ? value
      : null;
  } catch {
    return null;
  }
}
export const saveLogin = (login: Login) =>
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(login));
export const clearLogin = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* Session is still cleared in memory. */
  }
};
export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

export const OPEN_IN = [
  {
    id: "metamask",
    name: "MetaMask",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    id: "rabby",
    name: "Rabby",
    href: (url: string) =>
      `https://go.rabby.io/mobile/?url=${encodeURIComponent(url)}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
