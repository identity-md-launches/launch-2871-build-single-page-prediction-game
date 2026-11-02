import { useEffect, useRef, useState } from "react";
import {
  useConnection,
  useConnect,
  useConnectors,
  useDisconnect,
  useSignMessage,
  type Connector,
} from "wagmi";
import { getAddress, type Address } from "viem";
import {
  clearLogin,
  loginMessage,
  OPEN_IN,
  readLogin,
  saveLogin,
  shortAddress,
  verifyLogin,
} from "../lib/wallet";
import { Modal } from "./Modal";
import { Icon } from "./Art";

export function Wallet({
  onLogin,
  onLogout,
}: {
  onLogin: (id: string) => void;
  onLogout: () => void;
}) {
  const { address, isConnected, connector: activeConnector } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const sign = useSignMessage();
  const [open, setOpen] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const accountRef = useRef(address);
  accountRef.current = address;
  const callbacks = useRef({ onLogin, onLogout });
  callbacks.current = { onLogin, onLogout };
  useEffect(() => {
    let live = true;
    setSigned(null);
    callbacks.current.onLogout();
    const login = readLogin();
    if (
      isConnected &&
      address &&
      login &&
      login.address.toLowerCase() === address.toLowerCase()
    ) {
      void verifyLogin(login)
        .then((valid) => {
          if (!live || !valid) return;
          setSigned(login.address.toLowerCase());
          callbacks.current.onLogin(login.address.toLowerCase());
        })
        .catch(() => {
          if (live) clearLogin();
        });
    }
    return () => {
      live = false;
    };
  }, [address, isConnected]);
  useEffect(() => {
    if (!signed) return;
    const t = setInterval(() => {
      const saved = readLogin();
      if (!saved || saved.expires <= Date.now()) {
        clearLogin();
        setSigned(null);
        callbacks.current.onLogout();
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [signed]);
  async function authenticate(connector?: Connector) {
    setError("");
    setPending(connector?.uid ?? "sign");
    try {
      let signingAddress = address;
      if (
        connector &&
        (!isConnected || activeConnector?.uid !== connector.uid)
      ) {
        const connected = await connect.mutateAsync({ connector });
        signingAddress = connected.accounts[0] as Address;
      }
      if (!signingAddress) throw new Error("Choose a wallet to continue.");
      const now = Date.now();
      const message = loginMessage(signingAddress, now);
      const signature = await sign.mutateAsync({
        message,
        account: signingAddress,
        ...(connector ? { connector } : {}),
      });
      const login = {
        address: signingAddress,
        message,
        signature,
        expires: now + 86_400_000,
      };
      if (!(await verifyLogin(login)))
        throw new Error(
          "The signature did not match this wallet. Sign in again.",
        );
      if (
        accountRef.current &&
        accountRef.current.toLowerCase() !== signingAddress.toLowerCase()
      )
        throw new Error(
          "The wallet account changed. Sign in with the current account.",
        );
      saveLogin(login);
      const id = signingAddress.toLowerCase();
      setSigned(id);
      callbacks.current.onLogin(id);
      setOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        /reject|denied|cancel|4001/i.test(message)
          ? "Signature cancelled. Your points are unchanged. You can try again."
          : /provider.*not|not.*provider|not.*installed/i.test(message)
            ? "No browser wallet was found. Install an extension or open this page in a wallet app."
            : /signature did|account changed/i.test(message)
              ? message
              : "Wallet sign-in could not finish. Check your wallet and try again.",
      );
    } finally {
      setPending(null);
    }
  }
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !named &&
    !("ethereum" in window);
  const listed = connectors
    .filter((c) => !(c.id === "injected" && named))
    .filter((c) => !mobile || c.type !== "injected");
  return (
    <>
      <button
        className="connect-button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Icon name="wallet" size={18} />
        <span>
          {signed && address
            ? shortAddress(getAddress(address))
            : "Connect wallet"}
        </span>
      </button>
      {open && (
        <Modal
          title={signed ? "Your wallet" : "Connect a wallet"}
          onClose={() => setOpen(false)}
          className="wallet-modal"
        >
          {signed && address ? (
            <>
              <p className="muted">
                Signed in for this session. Points stay in this browser.
              </p>
              <p className="full-address">{getAddress(address)}</p>
              <button
                className="button secondary full-width"
                onClick={() => {
                  clearLogin();
                  setSigned(null);
                  callbacks.current.onLogout();
                  disconnect.mutate();
                  setOpen(false);
                }}
              >
                Disconnect wallet
              </button>
            </>
          ) : (
            <>
              <p className="muted wallet-intro">
                Sign a message to play as your wallet. No gas, approvals, or
                transactions.
              </p>
              {isConnected && address && (
                <button
                  className="wallet-row"
                  disabled={!!pending}
                  onClick={() => void authenticate()}
                >
                  <Icon name="shield" size={28} />
                  <span>
                    {pending === "sign"
                      ? "Waiting for your signature…"
                      : `Sign in as ${shortAddress(address)}`}
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              )}
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    className="wallet-row"
                    key={w.id}
                    href={w.href(location.href)}
                  >
                    <img
                      src={`./wallets/${w.id}.svg`}
                      alt=""
                      width="28"
                      height="28"
                    />
                    <span>Open in {w.name}</span>
                    <Icon name="external" size={16} />
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  className="wallet-row"
                  key={c.uid}
                  disabled={!!pending}
                  onClick={() => void authenticate(c)}
                >
                  {c.icon ? (
                    <img src={c.icon} alt="" width="28" height="28" />
                  ) : c.id === "coinbaseWalletSDK" ? (
                    <img
                      src="./wallets/coinbase.svg"
                      alt=""
                      width="28"
                      height="28"
                    />
                  ) : (
                    <Icon name="wallet" size={28} />
                  )}
                  <span>
                    {c.id === "injected"
                      ? "Browser wallet"
                      : c.id === "coinbaseWalletSDK"
                        ? mobile
                          ? "Coinbase Smart Wallet"
                          : "Coinbase Wallet"
                        : c.name}
                    {pending === c.uid ? " · waiting…" : ""}
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
              <p className="wallet-error" role="status">
                {error}
              </p>
              <div className="wallet-note">
                <Icon name="shield" size={17} />
                <span>A local profile, never custody of funds.</span>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
