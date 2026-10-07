const PRODUCTS = {
  salad: { name: "Garden Fresh Salad", price: 320, icon: "✳", detail: "Market greens, olives and house dressing" },
  pasta: { name: "Creamy Truffle Pasta", price: 480, icon: "〰", detail: "Handmade pasta, truffle cream and parmesan" },
  steak: { name: "Grilled Steak", price: 720, icon: "✦", detail: "Roasted vegetables and garden herbs" },
  pizza: { name: "Italian Burrata Pizza", price: 420, icon: "◉", detail: "Burrata, basil and ripe tomatoes" },
  donut: { name: "Classic Donuts", price: 250, icon: "◌", detail: "Chocolate and caramel" },
  shake: { name: "Chocolate Shake", price: 280, icon: "❋", detail: "Chocolate, cream and chocolate chips" },
  signature: { name: "The Lumora Signature", price: 899, icon: "✧", detail: "Slow-cooked with roasted vegetables and herbs" }
};
const KEYS = { cart: "lumoraDemoCart", user: "lumoraDemoUser", orders: "lumoraDemoOrders", reservations: "lumoraDemoReservations" };
const formatPrice = (price) => `₹${Number(price).toLocaleString("en-IN")}`;

function readStore(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    showToast("Browser storage is unavailable. Your demo data was not saved.");
    return false;
  }
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2300);
}

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(endpoint, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The server could not complete your request.");
  return result;
}

function getCart() {
  return readStore(KEYS.cart, {});
}

function cartQuantity(cart = getCart()) {
  return Object.values(cart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
}

function cartTotal(cart = getCart()) {
  return Object.entries(cart).reduce((sum, [id, quantity]) => sum + (PRODUCTS[id]?.price || 0) * Number(quantity || 0), 0);
}

function updateCartBadges() {
  const quantity = cartQuantity();
  document.querySelectorAll(".cart-count").forEach((node) => { node.textContent = quantity; });
}

function addToCart(productId) {
  if (!PRODUCTS[productId]) return;
  const cart = getCart();
  cart[productId] = (cart[productId] || 0) + 1;
  if (writeStore(KEYS.cart, cart)) {
    updateCartBadges();
    showToast(`${PRODUCTS[productId].name} added to your bag.`);
  }
}

function renderCart() {
  const container = document.querySelector("#cart-items");
  if (!container) return;
  const cart = getCart();
  const entries = Object.entries(cart).filter(([id, qty]) => PRODUCTS[id] && Number(qty) > 0);
  const isEmpty = entries.length === 0;
  document.querySelector("#empty-cart").hidden = !isEmpty;
  document.querySelector("#bag-total").hidden = isEmpty;
  const orderForm = document.querySelector("#order-form");
  orderForm.querySelector("button[type=submit]").disabled = isEmpty;
  if (isEmpty) {
    container.replaceChildren();
    document.querySelector("#cart-subtotal").textContent = formatPrice(0);
    return;
  }
  container.replaceChildren(...entries.map(([id, quantity]) => {
    const item = PRODUCTS[id];
    const row = document.createElement("article");
    row.className = "cart-item";
    const art = document.createElement("div");
    art.className = "cart-item-art";
    art.setAttribute("aria-hidden", "true");
    art.textContent = item.icon;
    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.name;
    const detail = document.createElement("p");
    detail.textContent = item.detail;
    const controls = document.createElement("div");
    controls.className = "cart-controls";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.setAttribute("aria-label", `Remove one ${item.name}`);
    minus.textContent = "−";
    minus.addEventListener("click", () => changeQuantity(id, -1));
    const count = document.createElement("span");
    count.textContent = quantity;
    const plus = document.createElement("button");
    plus.type = "button";
    plus.setAttribute("aria-label", `Add one ${item.name}`);
    plus.textContent = "+";
    plus.addEventListener("click", () => changeQuantity(id, 1));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cart-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => changeQuantity(id, -Number(cart[id])));
    controls.append(minus, count, plus, remove);
    info.append(title, detail, controls);
    const price = document.createElement("strong");
    price.textContent = formatPrice(item.price * quantity);
    row.append(art, info, price);
    return row;
  }));
  document.querySelector("#cart-subtotal").textContent = formatPrice(cartTotal(cart));
}

function changeQuantity(id, change) {
  const cart = getCart();
  cart[id] = (cart[id] || 0) + change;
  if (cart[id] <= 0) delete cart[id];
  writeStore(KEYS.cart, cart);
  updateCartBadges();
  renderCart();
}

function setupNavigation() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  toggle?.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    toggle.textContent = isOpen ? "×" : "☰";
  });
}

function setupLogin() {
  const form = document.querySelector("#login-form");
  if (!form) return;
  const welcome = document.querySelector("#account-welcome");
  const switchButton = document.querySelector("#toggle-account");
  const emailInput = form.elements.email;
  const showSession = (email) => {
    form.hidden = true;
    welcome.hidden = false;
    document.querySelector("#account-email").textContent = email;
  };
  apiRequest("/api/me").then(({ user }) => {
    if (user?.email) showSession(user.email);
  }).catch(() => {
    form.querySelector(".form-message").textContent = "Account service is unavailable. Start the Lumora server with `node server.js` and reload this page.";
  });
  switchButton.addEventListener("click", () => {
    const creating = switchButton.dataset.creating !== "true";
    switchButton.dataset.creating = String(creating);
    document.querySelector("#account-title").textContent = creating ? "Make yourself at home." : "Come on in.";
    document.querySelector("#account-subtitle").textContent = creating ? "Create a demo account using your email." : "Sign in to keep your details close.";
    document.querySelector("#login-submit").innerHTML = creating ? "Create demo account <span>→</span>" : "Sign in <span>→</span>";
    switchButton.textContent = creating ? "Already have an account? Sign in" : "Create a demo account";
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const email = emailInput.value.trim().toLowerCase();
    const password = form.elements.password.value;
    const creating = switchButton.dataset.creating === "true";
    const message = form.querySelector(".form-message");
    const submit = document.querySelector("#login-submit");
    submit.disabled = true;
    message.textContent = "";
    apiRequest(creating ? "/api/register" : "/api/login", {
      method: "POST", body: JSON.stringify({ email, password })
    }).then(({ user }) => {
      showSession(user.email);
      showToast(creating ? "Your Lumora account is ready." : "Welcome back to Lumora.");
    }).catch((error) => { message.textContent = error.message; })
      .finally(() => { submit.disabled = false; });
  });
  document.querySelector("#sign-out").addEventListener("click", () => {
    apiRequest("/api/logout", { method: "POST", body: "{}" }).catch(() => {})
      .finally(() => {
        welcome.hidden = true;
        form.reset();
        form.hidden = false;
        switchButton.dataset.creating = "false";
        document.querySelector("#account-title").textContent = "Come on in.";
        document.querySelector("#account-subtitle").textContent = "Sign in to keep your details close.";
        document.querySelector("#login-submit").innerHTML = "Sign in <span>→</span>";
        switchButton.textContent = "Create a demo account";
      });
  });
}

function setupReservation() {
  const form = document.querySelector("#reservation-form");
  if (!form) return;
  const dateField = form.elements.date;
  const today = new Date();
  const offset = today.getTimezoneOffset();
  dateField.min = new Date(today.getTime() - offset * 60_000).toISOString().slice(0, 10);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const reservation = Object.fromEntries(data.entries());
    const message = document.querySelector(".form-message");
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    message.textContent = "Sending your request…";
    apiRequest("/api/reservations", { method: "POST", body: JSON.stringify(reservation) })
      .then(() => {
      form.reset();
      message.textContent = `Thanks, ${reservation.name}. Your reservation request for ${reservation.guests} on ${reservation.date} at ${reservation.time} has been sent to Lumora.`;
    }).catch((error) => { message.textContent = error.message; })
      .finally(() => { submit.disabled = false; });
  });
}

function setupCheckout() {
  renderCart();
  const form = document.querySelector("#order-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const cart = getCart();
    if (cartQuantity(cart) === 0) {
      showToast("Add something from the menu before placing an order.");
      return;
    }
    const data = new FormData(form);
    const order = {
      name: String(data.get("name")).trim(),
      phone: String(data.get("phone")).trim(),
      pickup: data.get("pickup"),
      payment: data.get("payment"),
      items: Object.entries(cart).filter(([id, qty]) => PRODUCTS[id] && qty > 0).map(([id, qty]) => ({ id, quantity: qty }))
    };
    const submit = form.querySelector("button[type=submit]");
    const message = form.querySelector(".form-message");
    submit.disabled = true;
    message.textContent = "Saving your order…";
    apiRequest("/api/orders", { method: "POST", body: JSON.stringify(order) })
      .then(({ order: savedOrder }) => {
    writeStore(KEYS.cart, {});
    updateCartBadges();
    document.querySelector("#success-name").textContent = order.name;
    document.querySelector("#order-id").textContent = savedOrder.reference;
    document.querySelector("#success-summary").textContent = `${order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s) · ${formatPrice(savedOrder.total)} · ${order.pickup}. Payment is due at pickup.`;
    document.querySelector(".bag-panel").hidden = true;
    form.hidden = true;
    document.querySelector("#order-success").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch((error) => { message.textContent = error.message; })
      .finally(() => { submit.disabled = cartQuantity() === 0; });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  updateCartBadges();
  document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => addToCart(button.dataset.add)));
  setupLogin();
  setupReservation();
  setupCheckout();
});
