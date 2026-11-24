// Kill Switch (Round 2, Inject 2) terminal wording. Client-safe (no key material). One copy, used by the server parser and the terminal UI.
// The eight wrong-block messages are NOT here: they live only in the private key and reach the browser only after the matching block.
export const PROMPT = "ghost@nexus:~$";
export const BANNER = ["NEXUS SOC TERMINAL v2.1", "KILL SWITCH ACCESS GRANTED", "Type BLOCK <ip address> to cut a connection.", "You have 4 attempts. Choose carefully."] as const;
export const USAGE = "Usage: BLOCK <ip address>";
export const MSG = {
  unknown: `Unknown command. ${USAGE}`,
  missing: `Missing IP address. ${USAGE}`,
  tooMany: `Too many arguments. ${USAGE}`,
  invalid: "Invalid IP address format.",
  notListed: "Not a connection on this list.",
  duplicate: "Already blocked.",
  locked: "Terminal locked.",
  contained: "[OK] Both threats contained. Terminal locked.",
  exhausted: "[FAIL] Out of attempts. Terminal locked. See a volunteer.",
} as const;
export const HELP_LINES = [
  "BLOCK <ip address>   cut one connection (uses 1 of 4 attempts, right or wrong)",
  "help                 show this help",
  "clear                clear the screen (attempts and history are kept)",
  "Typos, IPs not on the list and repeats use no attempt.",
] as const;
/** "ATTEMPTS LEFT: 3/4" */
export const attemptsLabel = (left: number, max: number) => `ATTEMPTS LEFT: ${left}/${max}`;
