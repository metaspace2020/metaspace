const fetchPostJson = async(url: string, body: object) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

export const signOut = async() => {
  const response = await fetch('/api_auth/signout', { method: 'POST', credentials: 'include' })
  if (response.status !== 200) {
    throw new Error(`Unexpected response from server: ${response.status} ${response.statusText}`)
  }
}

export const signInByEmail = async(email: string, password: string): Promise<boolean> => {
  const response = await fetchPostJson('/api_auth/signin', { email, password })
  return response.status >= 200 && response.status < 300
}

export const createAccountByEmail = async(email: string, password: string, name: string) => {
  const response = await fetchPostJson('/api_auth/createaccount', { email, password, name })
  if (response.status !== 200) {
    throw new Error(`Unexpected response from server: ${response.status} ${response.statusText}`)
  }
}

export const sendPasswordResetToken = async(email: string) => {
  const response = await fetchPostJson('/api_auth/sendpasswordresettoken', { email })
  if (response.status !== 200) {
    throw new Error(`Unexpected response from server: ${response.status} ${response.statusText}`)
  }
}

export const validatePasswordResetToken = async(token: string, email: string): Promise<boolean> => {
  const response = await fetchPostJson('/api_auth/validatepasswordresettoken', { token, email })
  return response.status === 200
}

export const resetPassword = async(token: string, email: string, password: string) => {
  const response = await fetchPostJson('/api_auth/resetpassword', { token, email, password })
  if (response.status !== 200) {
    throw new Error(`Unexpected response from server: ${response.status} ${response.statusText}`)
  }
}
