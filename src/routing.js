export function navigateWithGetForm(event, navigate, pathname, allowedFields) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const searchParams = new URLSearchParams();
  const allowed = allowedFields ? new Set(allowedFields) : null;

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && (!allowed || allowed.has(key))) {
      searchParams.append(key, value);
    }
  }

  const search = searchParams.toString();
  navigate(search ? `${pathname}?${search}` : pathname);
}
