const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export async function apiRequest(
  path,
  { method = "GET", body, authenticated = true } = {}
) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = sessionStorage.getItem("messmateToken");
  if (authenticated && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("MessMate API request failed:", error);
    }
    throw new Error("Could not reach MessMate. Check that the API server is running.");
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("MessMate API returned an unreadable response:", error);
    }
    throw new Error("The MessMate API returned an invalid response.");
  }
  if (!response.ok) {
    if (response.status === 401 && authenticated) {
      sessionStorage.removeItem("messmateToken");
      sessionStorage.removeItem("messmateUser");
      window.dispatchEvent(new Event("messmate:unauthorized"));
    }
    const requestError = new Error(result.message || "The request could not be completed.");
    requestError.status = response.status;
    requestError.result = result.result;
    throw requestError;
  }
  return result;
}

export async function apiDownload(path) {
  const headers = {};
  const token = sessionStorage.getItem("messmateToken");
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers });
  } catch (error) {
    if (import.meta.env.DEV) console.error("MessMate report download failed:", error);
    throw new Error("Could not reach MessMate. Check that the API server is running.");
  }
  if (!response.ok) {
    let result = {};
    try {
      result = await response.json();
    } catch (error) {
      if (import.meta.env.DEV) console.error("MessMate report error response was unreadable:", error);
    }
    if (response.status === 401) {
      sessionStorage.removeItem("messmateToken");
      sessionStorage.removeItem("messmateUser");
      window.dispatchEvent(new Event("messmate:unauthorized"));
    }
    throw new Error(result.message || "The report could not be downloaded.");
  }
  const blob = await response.blob();
  const fileName = response.headers.get("Content-Disposition")
    ?.match(/filename="([^"]+)"/)?.[1] || "messmate-report.csv";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
