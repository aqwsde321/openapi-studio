export type SpecCredentials = { username: string; password: string };
export type SpecAuthRequest = { url: string; failed: boolean };

function basicAuthorization({ username, password }: SpecCredentials): string {
  if (username.includes(":") || /[\r\n]/.test(username + password)) throw new Error("아이디에 콜론을 쓰거나 계정에 줄바꿈을 넣을 수 없습니다");
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""))}`;
}

/** Credentials live only during loading and are never passed to the API workspace. */
export async function fetchSpec(
  url: string,
  credentials: RequestCredentials,
  requestAccount: (request: SpecAuthRequest) => Promise<SpecCredentials | null>,
): Promise<Response> {
  let response = await fetch(url, { credentials });
  let failed = false;
  while (response.status === 401) {
    const challenge = response.headers.get("www-authenticate");
    // Cross-origin servers may not expose WWW-Authenticate to browser JavaScript.
    if (challenge && !/(?:^|,)\s*Basic(?:\s|$)/i.test(challenge)) break;
    const target = response.url || url;
    const account = await requestAccount({ url: target, failed });
    if (!account) throw new Error("명세 인증을 취소했습니다");
    // Do not forward an explicitly entered account through another redirect.
    response = await fetch(target, { credentials, headers: { Authorization: basicAuthorization(account) }, redirect: "error" });
    failed = true;
  }
  if (!response.ok) throw new Error(`명세를 불러오지 못했습니다 (HTTP ${response.status})`);
  return response;
}

export function requestSpecAccount(element: HTMLElement, request: SpecAuthRequest): Promise<SpecCredentials | null> {
  return new Promise(resolve => {
    const form = document.createElement("form");
    form.className = "studio-spec-auth";
    form.setAttribute("aria-label", "API 명세 인증");
    const title = document.createElement("h1"); title.textContent = "API 명세 인증";
    const description = document.createElement("p"); description.textContent = "서버가 요구하는 Swagger 계정을 입력하세요. 계정은 저장하지 않습니다.";
    const server = document.createElement("code"); server.textContent = new URL(request.url).origin;
    const field = (name: string, text: string, type: string, autocomplete: HTMLInputElement["autocomplete"]) => {
      const label = document.createElement("label"); label.textContent = text;
      const input = document.createElement("input"); input.name = name; input.type = type; input.autocomplete = autocomplete; input.required = true;
      label.append(input); return { label, input };
    };
    const username = field("username", "아이디", "text", "username");
    const password = field("password", "비밀번호", "password", "current-password");
    const error = document.createElement("p"); error.setAttribute("role", "alert");
    if (request.failed) error.textContent = "인증에 실패했습니다. 아이디와 비밀번호를 확인하세요.";
    const actions = document.createElement("div"); actions.className = "api-actions";
    const submit = document.createElement("button"); submit.type = "submit"; submit.className = "api-primary"; submit.textContent = "명세 불러오기";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "취소";
    actions.append(cancel, submit);
    form.append(title, description, server, username.label, password.label, error, actions);
    element.replaceChildren(form);
    const wasConnected = element.isConnected;
    const observer = new MutationObserver(() => { if (wasConnected && !element.isConnected) finish(null); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const finish = (account: SpecCredentials | null) => {
      observer.disconnect(); password.input.value = ""; form.remove(); resolve(account);
    };
    cancel.onclick = () => finish(null);
    form.onsubmit = event => {
      event.preventDefault();
      if (username.input.value.includes(":")) { error.textContent = "아이디에는 콜론(:)을 사용할 수 없습니다."; return; }
      finish({ username: username.input.value, password: password.input.value });
    };
    username.input.focus();
  });
}
