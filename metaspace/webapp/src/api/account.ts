const fetchPostJson = async (url: string, body: object) =>
  await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

export const signInByEmail = async (email: string, password: string): Promise<boolean> => {
  const response = await fetchPostJson('/auth/signin', { email, password });
  return response.status >= 200 && response.status < 300;
};

export const createAccountByEmail = async (email: string, password: string, name: string) => {
  const response = await fetchPostJson('/auth/createaccount', { email, password, name });
  if (response.status !== 200) {
    throw new Error(`Unexpected response from server: ${response.status} ${response.statusText}`)
  }
};

export const sendPasswordResetToken = async (email: string) => {
  const response = await fetchPostJson('/auth/sendpasswordresettoken', { email });
  if (response.status !== 200) {
    throw new Error(`Unexpected response from server: ${response.status} ${response.statusText}`)
  }
};

export const validatePasswordResetToken = async (token: string, email: string): Promise<boolean> => {
  const response = await fetchPostJson('/auth/validatepasswordresettoken', { token, email });
  return response.status === 200;
};


export const resetPassword = async (token: string, email: string, password: string) => {
  const response = await fetchPostJson('/auth/sendpasswordreset', { token, email, password });
  if (response.status !== 200) {
    throw new Error(`Unexpected response from server: ${response.status} ${response.statusText}`)
  }
};
