import { Env } from "./auth";

export async function dispatchGithubWorkflow(
  env: Env,
  workflowFile: string,
  inputs: Record<string, string> = {}
): Promise<{ ok: boolean; status: number; detail: string }> {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY || env.GITHUB_REPOSITORY.startsWith("username/")) {
    return { ok: false, status: 400, detail: "GITHUB_REPOSITORY veya GITHUB_DISPATCH_TOKEN ayarlı değil." };
  }

  const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${workflowFile}/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "AyzEla-Worker/1.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs }),
  });

  return {
    ok: resp.status === 204 || resp.ok,
    status: resp.status,
    detail: resp.status === 204 ? "GitHub Actions görevi tetiklendi." : await resp.text(),
  };
}
