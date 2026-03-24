/**
 * BALAGE Benchmark Suite — 50-Website HTML Corpus
 *
 * 10 Kategorien × 5 Fixtures = 50 statische HTML-Fragmente.
 * Jede Fixture repraesentiert einen typischen Website-Typ mit
 * realistischen Attributen fuer Endpoint-Detection.
 */

import type { CorpusEntry, CorpusCategory } from "./types.js";

// ============================================================================
// ECOMMERCE (5 Fixtures)
// ============================================================================

const ecommerce001: CorpusEntry = {
  id: "ecommerce-001",
  name: "Product Page with Add to Cart",
  category: "ecommerce",
  url: "https://shop.example.com/product/wireless-headphones",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Wireless Headphones - ShopExample</title></head>
<body>
  <header role="banner">
    <nav aria-label="Main navigation" data-testid="main-nav">
      <a href="/" data-testid="logo">ShopExample</a>
      <ul role="menubar">
        <li role="menuitem"><a href="/electronics">Electronics</a></li>
        <li role="menuitem"><a href="/accessories">Accessories</a></li>
        <li role="menuitem"><a href="/deals">Deals</a></li>
      </ul>
      <form role="search" action="/search" data-testid="search-form">
        <input type="search" name="q" aria-label="Search products" placeholder="Search..." />
        <button type="submit" aria-label="Search">Search</button>
      </form>
      <a href="/cart" aria-label="Shopping cart" data-testid="cart-link">Cart (0)</a>
      <a href="/account/login" data-testid="login-link">Sign In</a>
    </nav>
  </header>
  <main>
    <nav aria-label="Breadcrumb"><ol>
      <li><a href="/">Home</a></li>
      <li><a href="/electronics">Electronics</a></li>
      <li aria-current="page">Wireless Headphones</li>
    </ol></nav>
    <article data-testid="product-detail" itemscope itemtype="https://schema.org/Product">
      <h1 itemprop="name">Premium Wireless Headphones</h1>
      <div class="product-rating" aria-label="4.5 out of 5 stars">★★★★½ (128 reviews)</div>
      <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <span itemprop="price" content="129.99">$129.99</span>
        <meta itemprop="availability" content="https://schema.org/InStock" />
      </div>
      <p itemprop="description">Premium noise-cancelling wireless headphones with 30-hour battery life.</p>
      <form data-testid="add-to-cart-form" action="/cart/add" method="post">
        <input type="hidden" name="product_id" value="WH-001" />
        <label for="quantity">Quantity:</label>
        <select id="quantity" name="quantity" aria-label="Select quantity">
          <option value="1">1</option><option value="2">2</option><option value="3">3</option>
        </select>
        <label for="color">Color:</label>
        <select id="color" name="color" aria-label="Select color">
          <option value="black">Black</option><option value="white">White</option><option value="blue">Navy Blue</option>
        </select>
        <button type="submit" data-testid="add-to-cart-btn" class="btn-primary" aria-label="Add to cart">Add to Cart</button>
      </form>
      <button data-testid="wishlist-btn" aria-label="Add to wishlist" class="btn-secondary">♡ Add to Wishlist</button>
      <button data-testid="share-btn" aria-label="Share product">Share</button>
    </article>
    <section data-testid="product-reviews" aria-label="Customer reviews">
      <h2>Customer Reviews</h2>
      <div class="review" role="article"><p>Great sound quality!</p></div>
    </section>
  </main>
  <footer role="contentinfo">
    <nav aria-label="Footer navigation">
      <a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy Policy</a>
    </nav>
    <div data-testid="cookie-banner" role="dialog" aria-label="Cookie consent">
      <p>We use cookies to improve your experience.</p>
      <button data-testid="accept-cookies">Accept All</button>
      <button data-testid="reject-cookies">Reject</button>
    </div>
  </footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const ecommerce002: CorpusEntry = {
  id: "ecommerce-002",
  name: "Shopping Cart Page",
  category: "ecommerce",
  url: "https://shop.example.com/cart",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Shopping Cart - ShopExample</title></head>
<body>
  <header role="banner">
    <nav aria-label="Main navigation" data-testid="main-nav">
      <a href="/">ShopExample</a>
      <a href="/cart" aria-current="page" data-testid="cart-link">Cart (2)</a>
    </nav>
  </header>
  <main>
    <h1>Your Shopping Cart</h1>
    <section data-testid="cart-items" aria-label="Cart items">
      <table role="table" aria-label="Cart contents">
        <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr></thead>
        <tbody>
          <tr data-testid="cart-item-1">
            <td>Wireless Headphones</td><td>$129.99</td>
            <td><input type="number" name="qty_1" value="1" min="1" max="10" aria-label="Quantity for Wireless Headphones" data-testid="qty-input-1" /></td>
            <td>$129.99</td>
            <td><button data-testid="remove-item-1" aria-label="Remove Wireless Headphones from cart">Remove</button></td>
          </tr>
          <tr data-testid="cart-item-2">
            <td>Phone Case</td><td>$24.99</td>
            <td><input type="number" name="qty_2" value="1" min="1" max="10" aria-label="Quantity for Phone Case" data-testid="qty-input-2" /></td>
            <td>$24.99</td>
            <td><button data-testid="remove-item-2" aria-label="Remove Phone Case from cart">Remove</button></td>
          </tr>
        </tbody>
      </table>
    </section>
    <section data-testid="cart-summary" aria-label="Order summary">
      <div class="subtotal">Subtotal: <span data-testid="subtotal">$154.98</span></div>
      <form data-testid="coupon-form" action="/cart/coupon" method="post">
        <label for="coupon-code">Coupon Code:</label>
        <input type="text" id="coupon-code" name="coupon" aria-label="Enter coupon code" placeholder="Enter code" />
        <button type="submit" data-testid="apply-coupon-btn">Apply</button>
      </form>
      <button data-testid="update-cart-btn" aria-label="Update cart quantities">Update Cart</button>
      <a href="/checkout" data-testid="checkout-btn" role="button" class="btn-primary" aria-label="Proceed to checkout">Proceed to Checkout</a>
    </section>
    <a href="/" data-testid="continue-shopping">Continue Shopping</a>
  </main>
  <footer role="contentinfo"><p>&copy; 2026 ShopExample</p></footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const ecommerce003: CorpusEntry = {
  id: "ecommerce-003",
  name: "Checkout Page",
  category: "ecommerce",
  url: "https://shop.example.com/checkout",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Checkout - ShopExample</title></head>
<body>
  <header role="banner"><a href="/">ShopExample</a><span>Secure Checkout</span></header>
  <main>
    <h1>Checkout</h1>
    <form data-testid="checkout-form" action="/checkout/process" method="post" aria-label="Checkout form">
      <fieldset data-testid="shipping-section">
        <legend>Shipping Information</legend>
        <label for="ship-name">Full Name:</label>
        <input type="text" id="ship-name" name="shipping_name" required aria-required="true" autocomplete="name" />
        <label for="ship-email">Email:</label>
        <input type="email" id="ship-email" name="shipping_email" required aria-required="true" autocomplete="email" />
        <label for="ship-address">Address:</label>
        <input type="text" id="ship-address" name="shipping_address" required aria-required="true" autocomplete="street-address" />
        <label for="ship-city">City:</label>
        <input type="text" id="ship-city" name="shipping_city" required aria-required="true" autocomplete="address-level2" />
        <label for="ship-zip">ZIP Code:</label>
        <input type="text" id="ship-zip" name="shipping_zip" required aria-required="true" autocomplete="postal-code" pattern="[0-9]{5}" />
        <label for="ship-country">Country:</label>
        <select id="ship-country" name="shipping_country" aria-label="Select country" autocomplete="country">
          <option value="US">United States</option><option value="CA">Canada</option><option value="UK">United Kingdom</option>
        </select>
      </fieldset>
      <fieldset data-testid="payment-section">
        <legend>Payment Details</legend>
        <label for="card-number">Card Number:</label>
        <input type="text" id="card-number" name="card_number" required aria-required="true" autocomplete="cc-number" inputmode="numeric" pattern="[0-9]{16}" />
        <label for="card-expiry">Expiry Date:</label>
        <input type="text" id="card-expiry" name="card_expiry" required placeholder="MM/YY" autocomplete="cc-exp" />
        <label for="card-cvv">CVV:</label>
        <input type="text" id="card-cvv" name="card_cvv" required autocomplete="cc-csc" inputmode="numeric" maxlength="4" />
        <label for="card-name">Name on Card:</label>
        <input type="text" id="card-name" name="card_name" required autocomplete="cc-name" />
      </fieldset>
      <div data-testid="order-summary" aria-label="Order summary">
        <p>Subtotal: $154.98</p><p>Shipping: $9.99</p><p>Tax: $12.40</p>
        <p class="total"><strong>Total: $177.37</strong></p>
      </div>
      <label><input type="checkbox" name="terms" required aria-required="true" /> I agree to the <a href="/terms">Terms and Conditions</a></label>
      <button type="submit" data-testid="place-order-btn" class="btn-primary" aria-label="Place order">Place Order — $177.37</button>
    </form>
  </main>
  <footer role="contentinfo"><p>Secure checkout powered by Stripe</p></footer>
</body>
</html>`,
  metadata: { complexity: "complex", hasAuthentication: false, hasForms: true, hasNavigation: false, hasDynamicContent: false },
};

const ecommerce004: CorpusEntry = {
  id: "ecommerce-004",
  name: "Search Results Page",
  category: "ecommerce",
  url: "https://shop.example.com/search?q=headphones",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Search: headphones - ShopExample</title></head>
<body>
  <header role="banner">
    <nav aria-label="Main navigation" data-testid="main-nav">
      <a href="/">ShopExample</a>
      <form role="search" action="/search" data-testid="search-form">
        <input type="search" name="q" value="headphones" aria-label="Search products" />
        <button type="submit">Search</button>
      </form>
    </nav>
  </header>
  <main>
    <h1>Search Results for "headphones"</h1>
    <p aria-live="polite" data-testid="result-count">24 results found</p>
    <aside aria-label="Filter results" data-testid="filters">
      <form data-testid="filter-form">
        <fieldset><legend>Price Range</legend>
          <label><input type="checkbox" name="price" value="0-50" /> Under $50</label>
          <label><input type="checkbox" name="price" value="50-100" /> $50 - $100</label>
          <label><input type="checkbox" name="price" value="100-200" /> $100 - $200</label>
        </fieldset>
        <fieldset><legend>Brand</legend>
          <label><input type="checkbox" name="brand" value="sony" /> Sony</label>
          <label><input type="checkbox" name="brand" value="bose" /> Bose</label>
        </fieldset>
        <label for="sort-by">Sort by:</label>
        <select id="sort-by" name="sort" aria-label="Sort results">
          <option value="relevance">Relevance</option><option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option><option value="rating">Customer Rating</option>
        </select>
        <button type="submit" data-testid="apply-filters-btn">Apply Filters</button>
      </form>
    </aside>
    <section data-testid="search-results" aria-label="Search results">
      <article class="product-card" data-testid="product-card-1">
        <a href="/product/wh-001"><h2>Premium Wireless Headphones</h2></a>
        <span class="price">$129.99</span>
        <button data-testid="quick-add-1" aria-label="Quick add Premium Wireless Headphones">Add to Cart</button>
      </article>
      <article class="product-card" data-testid="product-card-2">
        <a href="/product/wh-002"><h2>Sport Earbuds</h2></a>
        <span class="price">$79.99</span>
        <button data-testid="quick-add-2" aria-label="Quick add Sport Earbuds">Add to Cart</button>
      </article>
    </section>
    <nav aria-label="Pagination" data-testid="pagination">
      <a href="/search?q=headphones&page=1" aria-current="page">1</a>
      <a href="/search?q=headphones&page=2">2</a>
      <a href="/search?q=headphones&page=3">3</a>
      <a href="/search?q=headphones&page=2" aria-label="Next page">Next</a>
    </nav>
  </main>
  <footer role="contentinfo"><p>&copy; 2026 ShopExample</p></footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const ecommerce005: CorpusEntry = {
  id: "ecommerce-005",
  name: "Category Page",
  category: "ecommerce",
  url: "https://shop.example.com/category/electronics",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Electronics - ShopExample</title></head>
<body>
  <header role="banner">
    <nav aria-label="Main navigation" data-testid="main-nav">
      <a href="/">ShopExample</a>
      <ul role="menubar">
        <li role="menuitem"><a href="/electronics" aria-current="page">Electronics</a></li>
        <li role="menuitem"><a href="/clothing">Clothing</a></li>
        <li role="menuitem"><a href="/home">Home & Garden</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <nav aria-label="Breadcrumb"><ol>
      <li><a href="/">Home</a></li><li aria-current="page">Electronics</li>
    </ol></nav>
    <h1>Electronics</h1>
    <nav aria-label="Subcategories" data-testid="subcategories">
      <ul>
        <li><a href="/electronics/headphones">Headphones</a></li>
        <li><a href="/electronics/speakers">Speakers</a></li>
        <li><a href="/electronics/phones">Phones</a></li>
        <li><a href="/electronics/tablets">Tablets</a></li>
      </ul>
    </nav>
    <section data-testid="product-grid" aria-label="Products">
      <article class="product-card"><a href="/product/wh-001"><h2>Wireless Headphones</h2></a><span>$129.99</span></article>
      <article class="product-card"><a href="/product/sp-001"><h2>Bluetooth Speaker</h2></a><span>$89.99</span></article>
      <article class="product-card"><a href="/product/ph-001"><h2>Smartphone X</h2></a><span>$699.99</span></article>
      <article class="product-card"><a href="/product/tb-001"><h2>Tablet Pro</h2></a><span>$499.99</span></article>
    </section>
    <nav aria-label="Pagination" data-testid="pagination">
      <a href="?page=1" aria-current="page">1</a><a href="?page=2">2</a>
    </nav>
  </main>
  <footer role="contentinfo"><nav aria-label="Footer"><a href="/about">About</a><a href="/contact">Contact</a></nav></footer>
</body>
</html>`,
  metadata: { complexity: "simple", hasAuthentication: false, hasForms: false, hasNavigation: true, hasDynamicContent: false },
};

// ============================================================================
// SAAS (5 Fixtures)
// ============================================================================

const saas001: CorpusEntry = {
  id: "saas-001",
  name: "SaaS Dashboard",
  category: "saas",
  url: "https://app.saasplatform.io/dashboard",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Dashboard - SaasPlatform</title></head>
<body>
  <nav aria-label="Sidebar navigation" data-testid="sidebar" role="navigation">
    <a href="/dashboard" aria-current="page" data-testid="nav-dashboard">Dashboard</a>
    <a href="/projects" data-testid="nav-projects">Projects</a>
    <a href="/analytics" data-testid="nav-analytics">Analytics</a>
    <a href="/team" data-testid="nav-team">Team</a>
    <a href="/settings" data-testid="nav-settings">Settings</a>
    <a href="/billing" data-testid="nav-billing">Billing</a>
  </nav>
  <header role="banner">
    <form role="search" data-testid="search-form">
      <input type="search" placeholder="Search everything..." aria-label="Search dashboard" />
    </form>
    <button data-testid="notifications-btn" aria-label="Notifications" aria-haspopup="true">🔔 3</button>
    <div data-testid="user-menu" role="menu">
      <button aria-haspopup="true" aria-expanded="false" data-testid="user-avatar">Alex D.</button>
    </div>
  </header>
  <main>
    <h1>Dashboard</h1>
    <section data-testid="metrics-overview" aria-label="Key metrics">
      <div class="metric-card" data-testid="metric-revenue"><h2>Revenue</h2><span>$24,500</span></div>
      <div class="metric-card" data-testid="metric-users"><h2>Active Users</h2><span>1,234</span></div>
      <div class="metric-card" data-testid="metric-conversion"><h2>Conversion</h2><span>3.2%</span></div>
    </section>
    <section data-testid="recent-activity" aria-label="Recent activity">
      <h2>Recent Activity</h2>
      <ul role="list"><li>User signed up — 2 min ago</li><li>Order #1234 completed — 15 min ago</li></ul>
    </section>
    <section data-testid="quick-actions" aria-label="Quick actions">
      <button data-testid="create-project-btn" class="btn-primary">+ New Project</button>
      <button data-testid="invite-team-btn">Invite Team Member</button>
      <button data-testid="export-data-btn">Export Data</button>
    </section>
  </main>
</body>
</html>`,
  metadata: { framework: "react", complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const saas002: CorpusEntry = {
  id: "saas-002",
  name: "SaaS Settings Page",
  category: "saas",
  url: "https://app.saasplatform.io/settings",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Settings - SaasPlatform</title></head>
<body>
  <nav aria-label="Sidebar navigation" role="navigation">
    <a href="/dashboard">Dashboard</a><a href="/settings" aria-current="page">Settings</a>
  </nav>
  <main>
    <h1>Account Settings</h1>
    <nav aria-label="Settings tabs" role="tablist" data-testid="settings-tabs">
      <button role="tab" aria-selected="true" data-testid="tab-general">General</button>
      <button role="tab" aria-selected="false" data-testid="tab-security">Security</button>
      <button role="tab" aria-selected="false" data-testid="tab-notifications">Notifications</button>
      <button role="tab" aria-selected="false" data-testid="tab-integrations">Integrations</button>
    </nav>
    <section role="tabpanel" data-testid="general-settings" aria-label="General settings">
      <form data-testid="profile-form" action="/api/settings/profile" method="post">
        <label for="display-name">Display Name:</label>
        <input type="text" id="display-name" name="display_name" value="Alex D." aria-required="true" />
        <label for="email">Email:</label>
        <input type="email" id="email" name="email" value="julius@example.com" aria-required="true" />
        <label for="timezone">Timezone:</label>
        <select id="timezone" name="timezone">
          <option value="Europe/Berlin" selected>Europe/Berlin (CET)</option>
          <option value="America/New_York">America/New_York (EST)</option>
        </select>
        <label for="language">Language:</label>
        <select id="language" name="language">
          <option value="en" selected>English</option><option value="de">Deutsch</option>
        </select>
        <button type="submit" data-testid="save-settings-btn" class="btn-primary">Save Changes</button>
      </form>
    </section>
    <section data-testid="danger-zone" aria-label="Danger zone">
      <h2>Danger Zone</h2>
      <button data-testid="delete-account-btn" class="btn-danger" aria-label="Delete account">Delete Account</button>
    </section>
  </main>
</body>
</html>`,
  metadata: { framework: "react", complexity: "medium", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const saas003: CorpusEntry = {
  id: "saas-003",
  name: "SaaS Pricing Page",
  category: "saas",
  url: "https://www.saasplatform.io/pricing",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Pricing - SaasPlatform</title></head>
<body>
  <header role="banner">
    <nav aria-label="Main navigation" data-testid="main-nav">
      <a href="/">SaasPlatform</a>
      <ul role="menubar">
        <li><a href="/features">Features</a></li><li><a href="/pricing" aria-current="page">Pricing</a></li>
        <li><a href="/docs">Docs</a></li><li><a href="/blog">Blog</a></li>
      </ul>
      <a href="/login" data-testid="login-btn">Log In</a>
      <a href="/signup" data-testid="signup-btn" role="button" class="btn-primary">Start Free Trial</a>
    </nav>
  </header>
  <main>
    <h1>Simple, Transparent Pricing</h1>
    <div data-testid="billing-toggle" role="radiogroup" aria-label="Billing period">
      <label><input type="radio" name="billing" value="monthly" checked /> Monthly</label>
      <label><input type="radio" name="billing" value="annual" /> Annual (Save 20%)</label>
    </div>
    <section data-testid="pricing-plans" aria-label="Pricing plans">
      <article data-testid="plan-starter" class="pricing-card">
        <h2>Starter</h2><p class="price">$29/mo</p>
        <ul><li>5 Projects</li><li>10GB Storage</li><li>Email Support</li></ul>
        <a href="/signup?plan=starter" role="button" class="btn-secondary" data-testid="select-starter">Select Starter</a>
      </article>
      <article data-testid="plan-pro" class="pricing-card featured">
        <span class="badge">Most Popular</span>
        <h2>Professional</h2><p class="price">$79/mo</p>
        <ul><li>Unlimited Projects</li><li>100GB Storage</li><li>Priority Support</li><li>API Access</li></ul>
        <a href="/signup?plan=pro" role="button" class="btn-primary" data-testid="select-pro">Start Free Trial</a>
      </article>
      <article data-testid="plan-enterprise" class="pricing-card">
        <h2>Enterprise</h2><p class="price">Custom</p>
        <ul><li>Everything in Pro</li><li>Dedicated Support</li><li>SLA</li><li>SSO</li></ul>
        <a href="/contact-sales" role="button" data-testid="contact-sales-btn">Contact Sales</a>
      </article>
    </section>
  </main>
  <footer role="contentinfo"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const saas004: CorpusEntry = {
  id: "saas-004",
  name: "SaaS Signup Page",
  category: "saas",
  url: "https://app.saasplatform.io/signup",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Sign Up - SaasPlatform</title></head>
<body>
  <header role="banner"><a href="/">SaasPlatform</a></header>
  <main>
    <section data-testid="signup-section" aria-label="Create account">
      <h1>Create Your Account</h1>
      <p>Start your 14-day free trial. No credit card required.</p>
      <form data-testid="signup-form" action="/api/auth/signup" method="post" aria-label="Sign up form">
        <label for="signup-name">Full Name:</label>
        <input type="text" id="signup-name" name="name" required aria-required="true" autocomplete="name" placeholder="John Doe" />
        <label for="signup-email">Work Email:</label>
        <input type="email" id="signup-email" name="email" required aria-required="true" autocomplete="email" placeholder="john@company.com" />
        <label for="signup-password">Password:</label>
        <input type="password" id="signup-password" name="password" required aria-required="true" autocomplete="new-password" minlength="8" aria-describedby="password-hint" />
        <p id="password-hint" class="hint">At least 8 characters with one uppercase and one number.</p>
        <label for="signup-company">Company Name:</label>
        <input type="text" id="signup-company" name="company" autocomplete="organization" />
        <label><input type="checkbox" name="terms" required aria-required="true" /> I agree to the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a></label>
        <label><input type="checkbox" name="newsletter" /> Send me product updates</label>
        <button type="submit" data-testid="signup-submit-btn" class="btn-primary">Create Account</button>
      </form>
      <div data-testid="social-auth" aria-label="Sign up with social accounts">
        <button data-testid="google-signup" aria-label="Sign up with Google">Sign up with Google</button>
        <button data-testid="github-signup" aria-label="Sign up with GitHub">Sign up with GitHub</button>
      </div>
      <p>Already have an account? <a href="/login" data-testid="login-link">Log in</a></p>
    </section>
  </main>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: true, hasForms: true, hasNavigation: false, hasDynamicContent: false },
};

const saas005: CorpusEntry = {
  id: "saas-005",
  name: "SaaS User Profile",
  category: "saas",
  url: "https://app.saasplatform.io/profile",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Profile - SaasPlatform</title></head>
<body>
  <nav aria-label="Sidebar" role="navigation"><a href="/dashboard">Dashboard</a><a href="/profile" aria-current="page">Profile</a></nav>
  <main>
    <h1>Your Profile</h1>
    <section data-testid="avatar-section" aria-label="Profile photo">
      <img src="/avatars/default.png" alt="Profile photo" data-testid="avatar-img" />
      <form data-testid="avatar-upload-form" enctype="multipart/form-data">
        <label for="avatar-file">Upload new photo:</label>
        <input type="file" id="avatar-file" name="avatar" accept="image/*" aria-label="Upload profile photo" />
        <button type="submit" data-testid="upload-avatar-btn">Upload</button>
      </form>
    </section>
    <form data-testid="profile-edit-form" action="/api/profile" method="post" aria-label="Edit profile">
      <label for="profile-name">Display Name:</label>
      <input type="text" id="profile-name" name="display_name" value="Alex D." />
      <label for="profile-bio">Bio:</label>
      <textarea id="profile-bio" name="bio" rows="4" maxlength="500" aria-label="Your bio">Deep Tech Founder</textarea>
      <label for="profile-website">Website:</label>
      <input type="url" id="profile-website" name="website" placeholder="https://..." />
      <label for="profile-location">Location:</label>
      <input type="text" id="profile-location" name="location" value="Vienna, Austria" />
      <button type="submit" data-testid="save-profile-btn" class="btn-primary">Save Profile</button>
    </form>
    <section data-testid="connected-accounts" aria-label="Connected accounts">
      <h2>Connected Accounts</h2>
      <div><span>Google</span><button data-testid="disconnect-google">Disconnect</button></div>
      <div><span>GitHub</span><button data-testid="connect-github">Connect</button></div>
    </section>
  </main>
</body>
</html>`,
  metadata: { framework: "react", complexity: "medium", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

// ============================================================================
// HEALTHCARE (5 Fixtures)
// ============================================================================

const healthcare001: CorpusEntry = {
  id: "healthcare-001",
  name: "Appointment Booking",
  category: "healthcare",
  url: "https://portal.healthsystem.org/appointments/new",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Book Appointment - HealthSystem Portal</title></head>
<body>
  <header role="banner">
    <nav aria-label="Main navigation"><a href="/">HealthSystem</a>
      <a href="/appointments" aria-current="page">Appointments</a>
      <a href="/records">Medical Records</a><a href="/messages">Messages</a>
    </nav>
    <span data-testid="patient-name">Welcome, Patient</span>
  </header>
  <main>
    <h1>Schedule an Appointment</h1>
    <form data-testid="appointment-form" action="/api/appointments" method="post" aria-label="Appointment booking form">
      <label for="dept">Department:</label>
      <select id="dept" name="department" required aria-required="true" data-testid="dept-select">
        <option value="">Select Department</option>
        <option value="general">General Practice</option><option value="cardiology">Cardiology</option>
        <option value="dermatology">Dermatology</option><option value="orthopedics">Orthopedics</option>
      </select>
      <label for="provider">Provider:</label>
      <select id="provider" name="provider_id" required aria-required="true" data-testid="provider-select">
        <option value="">Select Provider</option><option value="dr-smith">Dr. Smith</option><option value="dr-jones">Dr. Jones</option>
      </select>
      <label for="appt-date">Preferred Date:</label>
      <input type="date" id="appt-date" name="date" required aria-required="true" min="2026-03-18" data-testid="date-input" />
      <label for="appt-time">Preferred Time:</label>
      <select id="appt-time" name="time_slot" required aria-required="true" data-testid="time-select">
        <option value="09:00">9:00 AM</option><option value="10:00">10:00 AM</option>
        <option value="11:00">11:00 AM</option><option value="14:00">2:00 PM</option>
      </select>
      <label for="visit-reason">Reason for Visit:</label>
      <textarea id="visit-reason" name="reason" rows="3" required aria-required="true" data-testid="reason-textarea" placeholder="Describe your symptoms or reason..."></textarea>
      <label><input type="checkbox" name="new_patient" /> I am a new patient</label>
      <label><input type="checkbox" name="telehealth" data-testid="telehealth-checkbox" /> I prefer a telehealth visit</label>
      <button type="submit" data-testid="book-appointment-btn" class="btn-primary">Book Appointment</button>
    </form>
  </main>
  <footer role="contentinfo"><p>If this is an emergency, call 911.</p><a href="/privacy">HIPAA Privacy Notice</a></footer>
</body>
</html>`,
  metadata: { complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const healthcare002: CorpusEntry = {
  id: "healthcare-002",
  name: "Patient Portal Home",
  category: "healthcare",
  url: "https://portal.healthsystem.org/home",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Patient Portal - HealthSystem</title></head>
<body>
  <header role="banner">
    <nav aria-label="Main navigation" data-testid="main-nav">
      <a href="/">HealthSystem</a>
      <a href="/home" aria-current="page">Home</a><a href="/appointments">Appointments</a>
      <a href="/records">Records</a><a href="/messages">Messages</a><a href="/billing">Billing</a>
    </nav>
    <button data-testid="logout-btn" aria-label="Log out">Log Out</button>
  </header>
  <main>
    <h1>Welcome, Patient</h1>
    <section data-testid="upcoming-appointments" aria-label="Upcoming appointments">
      <h2>Upcoming Appointments</h2>
      <div class="appointment-card" data-testid="appt-1">
        <p>Dr. Smith — March 25, 2026 at 10:00 AM</p>
        <button data-testid="cancel-appt-1" aria-label="Cancel appointment with Dr. Smith">Cancel</button>
        <button data-testid="reschedule-appt-1" aria-label="Reschedule appointment">Reschedule</button>
      </div>
    </section>
    <section data-testid="quick-links" aria-label="Quick actions">
      <a href="/appointments/new" role="button" data-testid="book-btn" class="btn-primary">Book Appointment</a>
      <a href="/messages/new" role="button" data-testid="message-btn">Message Provider</a>
      <a href="/prescriptions" data-testid="rx-link">Prescriptions</a>
      <a href="/records/lab-results" data-testid="labs-link">Lab Results</a>
    </section>
    <section data-testid="health-summary" aria-label="Health summary">
      <h2>Health Summary</h2>
      <div role="list"><div role="listitem">Blood Pressure: 120/80</div><div role="listitem">Heart Rate: 72 bpm</div></div>
    </section>
  </main>
  <footer role="contentinfo"><a href="/privacy">Privacy</a><a href="/accessibility">Accessibility</a></footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: true, hasForms: false, hasNavigation: true, hasDynamicContent: true },
};

const healthcare003: CorpusEntry = {
  id: "healthcare-003",
  name: "Lab Results Page",
  category: "healthcare",
  url: "https://portal.healthsystem.org/records/lab-results",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Lab Results - HealthSystem Portal</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">HealthSystem</a><a href="/records" aria-current="page">Records</a></nav></header>
  <main>
    <h1>Lab Results</h1>
    <form data-testid="lab-filter-form" aria-label="Filter lab results">
      <label for="date-range">Date Range:</label>
      <select id="date-range" name="range" data-testid="date-range-select">
        <option value="30">Last 30 Days</option><option value="90">Last 90 Days</option><option value="365">Last Year</option><option value="all">All Time</option>
      </select>
      <label for="lab-type">Type:</label>
      <select id="lab-type" name="type" data-testid="lab-type-select">
        <option value="all">All Types</option><option value="blood">Blood Work</option><option value="urine">Urinalysis</option>
      </select>
      <button type="submit" data-testid="filter-btn">Filter</button>
    </form>
    <section data-testid="lab-results" aria-label="Lab results list">
      <table role="table" aria-label="Lab results">
        <thead><tr><th>Date</th><th>Test</th><th>Result</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          <tr data-testid="lab-row-1"><td>2026-03-10</td><td>Complete Blood Count</td><td>Normal</td>
            <td><span class="status-normal" aria-label="Normal result">Normal</span></td>
            <td><button data-testid="view-details-1" aria-label="View details for CBC">View</button>
            <button data-testid="download-pdf-1" aria-label="Download PDF report">Download PDF</button></td></tr>
          <tr data-testid="lab-row-2"><td>2026-03-01</td><td>Metabolic Panel</td><td>Abnormal</td>
            <td><span class="status-abnormal" aria-label="Abnormal result">Review</span></td>
            <td><button data-testid="view-details-2">View</button><button data-testid="download-pdf-2">Download PDF</button></td></tr>
        </tbody>
      </table>
    </section>
  </main>
  <footer role="contentinfo"><p>Contact your provider for result interpretation.</p></footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const healthcare004: CorpusEntry = {
  id: "healthcare-004",
  name: "Prescription Refill",
  category: "healthcare",
  url: "https://portal.healthsystem.org/prescriptions",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Prescriptions - HealthSystem Portal</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">HealthSystem</a><a href="/prescriptions" aria-current="page">Prescriptions</a></nav></header>
  <main>
    <h1>My Prescriptions</h1>
    <section data-testid="active-prescriptions" aria-label="Active prescriptions">
      <h2>Active Prescriptions</h2>
      <div class="rx-card" data-testid="rx-1">
        <h3>Lisinopril 10mg</h3><p>Take 1 tablet daily — Dr. Smith</p><p>Refills remaining: 3</p>
        <button data-testid="refill-rx-1" class="btn-primary" aria-label="Request refill for Lisinopril">Request Refill</button>
      </div>
      <div class="rx-card" data-testid="rx-2">
        <h3>Metformin 500mg</h3><p>Take 2 tablets daily — Dr. Jones</p><p>Refills remaining: 0</p>
        <button data-testid="contact-provider-rx-2" aria-label="Contact provider about Metformin">Contact Provider</button>
      </div>
    </section>
    <section data-testid="pharmacy-info" aria-label="Preferred pharmacy">
      <h2>Preferred Pharmacy</h2>
      <form data-testid="pharmacy-form" aria-label="Update pharmacy">
        <label for="pharmacy-search">Search Pharmacy:</label>
        <input type="text" id="pharmacy-search" name="pharmacy" aria-label="Search for pharmacy" placeholder="Enter pharmacy name or zip code" />
        <button type="submit" data-testid="search-pharmacy-btn">Search</button>
      </form>
      <p>Current: CVS Pharmacy — 123 Main St</p>
    </section>
  </main>
  <footer role="contentinfo"><a href="/privacy">Privacy</a></footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const healthcare005: CorpusEntry = {
  id: "healthcare-005",
  name: "Provider Search",
  category: "healthcare",
  url: "https://www.healthsystem.org/find-a-provider",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Find a Provider - HealthSystem</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">HealthSystem</a><a href="/find-a-provider" aria-current="page">Find a Provider</a><a href="/locations">Locations</a></nav></header>
  <main>
    <h1>Find a Provider</h1>
    <form data-testid="provider-search-form" role="search" action="/find-a-provider/results" aria-label="Search for providers">
      <label for="specialty">Specialty:</label>
      <select id="specialty" name="specialty" data-testid="specialty-select">
        <option value="">All Specialties</option><option value="family-medicine">Family Medicine</option>
        <option value="cardiology">Cardiology</option><option value="dermatology">Dermatology</option>
      </select>
      <label for="location-input">Location:</label>
      <input type="text" id="location-input" name="location" placeholder="City, State or ZIP" data-testid="location-input" />
      <label for="insurance">Insurance:</label>
      <select id="insurance" name="insurance" data-testid="insurance-select">
        <option value="">All Insurance</option><option value="aetna">Aetna</option><option value="bcbs">Blue Cross</option>
      </select>
      <label><input type="checkbox" name="accepting" checked data-testid="accepting-checkbox" /> Accepting new patients</label>
      <label><input type="checkbox" name="telehealth" data-testid="telehealth-filter" /> Telehealth available</label>
      <button type="submit" data-testid="search-providers-btn" class="btn-primary">Search</button>
    </form>
    <section data-testid="provider-results" aria-label="Provider results">
      <article class="provider-card" data-testid="provider-1">
        <h2>Dr. Sarah Smith, MD</h2><p>Family Medicine — 2.3 miles</p>
        <p>Rating: ★★★★☆ (45 reviews)</p>
        <a href="/providers/dr-smith" data-testid="view-profile-1">View Profile</a>
        <a href="/appointments/new?provider=dr-smith" role="button" data-testid="book-1">Book Appointment</a>
      </article>
    </section>
  </main>
  <footer role="contentinfo"><a href="/privacy">Privacy</a></footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

// ============================================================================
// FINANCE (5 Fixtures)
// ============================================================================

const finance001: CorpusEntry = {
  id: "finance-001",
  name: "Banking Dashboard",
  category: "finance",
  url: "https://online.securebank.com/dashboard",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Dashboard - SecureBank Online</title></head>
<body>
  <header role="banner">
    <nav aria-label="Main navigation" data-testid="main-nav">
      <a href="/dashboard" aria-current="page">Dashboard</a><a href="/accounts">Accounts</a>
      <a href="/transfer">Transfers</a><a href="/billpay">Bill Pay</a><a href="/settings">Settings</a>
    </nav>
    <button data-testid="logout-btn" aria-label="Log out securely">Log Out</button>
  </header>
  <main>
    <h1>Account Overview</h1>
    <section data-testid="accounts-summary" aria-label="Account balances">
      <div class="account-card" data-testid="checking-account">
        <h2>Checking Account ****4523</h2><p class="balance" aria-label="Balance">$5,234.50</p>
        <a href="/accounts/checking" data-testid="view-checking">View Details</a>
      </div>
      <div class="account-card" data-testid="savings-account">
        <h2>Savings Account ****7891</h2><p class="balance" aria-label="Balance">$12,750.00</p>
        <a href="/accounts/savings" data-testid="view-savings">View Details</a>
      </div>
    </section>
    <section data-testid="recent-transactions" aria-label="Recent transactions">
      <h2>Recent Transactions</h2>
      <table role="table" aria-label="Transaction history">
        <thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Mar 16</td><td>Grocery Store</td><td>-$45.23</td></tr>
          <tr><td>Mar 15</td><td>Payroll Deposit</td><td>+$3,200.00</td></tr>
        </tbody>
      </table>
    </section>
    <section data-testid="quick-actions" aria-label="Quick actions">
      <a href="/transfer" role="button" data-testid="quick-transfer" class="btn-primary">Transfer Money</a>
      <a href="/billpay" role="button" data-testid="quick-billpay">Pay Bills</a>
      <a href="/deposit" role="button" data-testid="quick-deposit">Mobile Deposit</a>
    </section>
  </main>
  <footer role="contentinfo"><p>FDIC Insured. Equal Housing Lender.</p></footer>
</body>
</html>`,
  metadata: { complexity: "complex", hasAuthentication: true, hasForms: false, hasNavigation: true, hasDynamicContent: true },
};

const finance002: CorpusEntry = {
  id: "finance-002",
  name: "Money Transfer",
  category: "finance",
  url: "https://online.securebank.com/transfer",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Transfer - SecureBank Online</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/dashboard">Dashboard</a><a href="/transfer" aria-current="page">Transfers</a></nav></header>
  <main>
    <h1>Transfer Money</h1>
    <form data-testid="transfer-form" action="/api/transfer" method="post" aria-label="Money transfer form">
      <label for="from-account">From Account:</label>
      <select id="from-account" name="from_account" required aria-required="true" data-testid="from-account-select">
        <option value="checking">Checking ****4523 — $5,234.50</option>
        <option value="savings">Savings ****7891 — $12,750.00</option>
      </select>
      <label for="to-account">To Account:</label>
      <select id="to-account" name="to_account" required aria-required="true" data-testid="to-account-select">
        <option value="savings">Savings ****7891</option><option value="checking">Checking ****4523</option>
        <option value="external">External Account</option>
      </select>
      <label for="transfer-amount">Amount:</label>
      <input type="number" id="transfer-amount" name="amount" required aria-required="true" min="0.01" step="0.01" placeholder="0.00" data-testid="amount-input" inputmode="decimal" />
      <label for="transfer-date">Transfer Date:</label>
      <input type="date" id="transfer-date" name="date" value="2026-03-17" data-testid="date-input" />
      <label for="transfer-memo">Memo (optional):</label>
      <input type="text" id="transfer-memo" name="memo" maxlength="100" data-testid="memo-input" />
      <label for="transfer-frequency">Frequency:</label>
      <select id="transfer-frequency" name="frequency" data-testid="frequency-select">
        <option value="once">One Time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
      </select>
      <div data-testid="transfer-summary" aria-live="polite" class="summary">
        <p>Transfer $0.00 from Checking to Savings</p>
      </div>
      <button type="submit" data-testid="submit-transfer-btn" class="btn-primary" aria-label="Submit transfer">Transfer Money</button>
    </form>
  </main>
  <footer role="contentinfo"><p>Transfers may take 1-3 business days.</p></footer>
</body>
</html>`,
  metadata: { complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const finance003: CorpusEntry = {
  id: "finance-003",
  name: "Bill Pay",
  category: "finance",
  url: "https://online.securebank.com/billpay",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Bill Pay - SecureBank Online</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/dashboard">Dashboard</a><a href="/billpay" aria-current="page">Bill Pay</a></nav></header>
  <main>
    <h1>Pay Bills</h1>
    <section data-testid="upcoming-bills" aria-label="Upcoming bills">
      <h2>Upcoming Bills</h2>
      <div class="bill-card" data-testid="bill-1">
        <h3>Electric Company</h3><p>Due: Mar 25 — $124.50</p>
        <button data-testid="pay-bill-1" class="btn-primary" aria-label="Pay Electric Company bill">Pay Now</button>
      </div>
      <div class="bill-card" data-testid="bill-2">
        <h3>Internet Provider</h3><p>Due: Mar 28 — $79.99</p>
        <button data-testid="pay-bill-2" aria-label="Pay Internet Provider bill">Pay Now</button>
      </div>
    </section>
    <section data-testid="add-payee" aria-label="Add a new payee">
      <h2>Add New Payee</h2>
      <form data-testid="add-payee-form" action="/api/billpay/payee" method="post">
        <label for="payee-name">Payee Name:</label>
        <input type="text" id="payee-name" name="payee_name" required aria-required="true" />
        <label for="payee-account">Account Number:</label>
        <input type="text" id="payee-account" name="account_number" required aria-required="true" inputmode="numeric" />
        <label for="payee-address">Address:</label>
        <input type="text" id="payee-address" name="address" />
        <button type="submit" data-testid="add-payee-btn">Add Payee</button>
      </form>
    </section>
    <section data-testid="schedule-payment" aria-label="Schedule a payment">
      <h2>Schedule Payment</h2>
      <form data-testid="schedule-form" action="/api/billpay/schedule" method="post">
        <label for="schedule-payee">Payee:</label>
        <select id="schedule-payee" name="payee_id" required><option value="elec">Electric Company</option><option value="inet">Internet Provider</option></select>
        <label for="schedule-amount">Amount:</label>
        <input type="number" id="schedule-amount" name="amount" required min="0.01" step="0.01" inputmode="decimal" />
        <label for="schedule-date">Payment Date:</label>
        <input type="date" id="schedule-date" name="date" required />
        <button type="submit" data-testid="schedule-payment-btn" class="btn-primary">Schedule Payment</button>
      </form>
    </section>
  </main>
</body>
</html>`,
  metadata: { complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const finance004: CorpusEntry = {
  id: "finance-004",
  name: "Account Settings",
  category: "finance",
  url: "https://online.securebank.com/settings",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Account Settings - SecureBank Online</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/dashboard">Dashboard</a><a href="/settings" aria-current="page">Settings</a></nav></header>
  <main>
    <h1>Account Settings</h1>
    <section data-testid="security-settings" aria-label="Security settings">
      <h2>Security</h2>
      <form data-testid="change-password-form" action="/api/settings/password" method="post">
        <label for="current-password">Current Password:</label>
        <input type="password" id="current-password" name="current_password" required autocomplete="current-password" />
        <label for="new-password">New Password:</label>
        <input type="password" id="new-password" name="new_password" required autocomplete="new-password" minlength="12" />
        <label for="confirm-password">Confirm Password:</label>
        <input type="password" id="confirm-password" name="confirm_password" required autocomplete="new-password" />
        <button type="submit" data-testid="change-password-btn">Change Password</button>
      </form>
      <div data-testid="two-factor" aria-label="Two-factor authentication">
        <h3>Two-Factor Authentication</h3>
        <p>Status: <span data-testid="2fa-status">Enabled</span></p>
        <button data-testid="manage-2fa-btn">Manage 2FA</button>
      </div>
    </section>
    <section data-testid="notification-settings" aria-label="Notification preferences">
      <h2>Notifications</h2>
      <form data-testid="notification-form">
        <label><input type="checkbox" name="email_alerts" checked /> Email alerts for transactions</label>
        <label><input type="checkbox" name="sms_alerts" /> SMS alerts for large transactions</label>
        <label><input type="checkbox" name="login_alerts" checked /> Email on new device login</label>
        <button type="submit" data-testid="save-notifications-btn">Save Preferences</button>
      </form>
    </section>
  </main>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const finance005: CorpusEntry = {
  id: "finance-005",
  name: "Loan Application",
  category: "finance",
  url: "https://online.securebank.com/loans/apply",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Loan Application - SecureBank</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">SecureBank</a><a href="/loans" aria-current="page">Loans</a></nav></header>
  <main>
    <h1>Personal Loan Application</h1>
    <div data-testid="loan-progress" role="progressbar" aria-valuenow="1" aria-valuemin="1" aria-valuemax="4" aria-label="Application progress">Step 1 of 4</div>
    <form data-testid="loan-application-form" action="/api/loans/apply" method="post" aria-label="Loan application">
      <fieldset><legend>Personal Information</legend>
        <label for="loan-name">Full Legal Name:</label>
        <input type="text" id="loan-name" name="full_name" required autocomplete="name" />
        <label for="loan-dob">Date of Birth:</label>
        <input type="date" id="loan-dob" name="date_of_birth" required />
        <label for="loan-ssn">Social Security Number:</label>
        <input type="text" id="loan-ssn" name="ssn" required inputmode="numeric" pattern="[0-9]{9}" aria-describedby="ssn-note" />
        <p id="ssn-note" class="hint">Your SSN is encrypted and securely transmitted.</p>
      </fieldset>
      <fieldset><legend>Employment & Income</legend>
        <label for="loan-employer">Employer:</label>
        <input type="text" id="loan-employer" name="employer" required />
        <label for="loan-income">Annual Income:</label>
        <input type="number" id="loan-income" name="annual_income" required min="0" inputmode="decimal" />
        <label for="loan-employment-years">Years at Current Job:</label>
        <input type="number" id="loan-employment-years" name="employment_years" min="0" />
      </fieldset>
      <fieldset><legend>Loan Details</legend>
        <label for="loan-amount">Requested Amount:</label>
        <input type="number" id="loan-amount" name="loan_amount" required min="1000" max="50000" step="500" />
        <label for="loan-purpose">Purpose:</label>
        <select id="loan-purpose" name="purpose" required>
          <option value="">Select Purpose</option><option value="debt">Debt Consolidation</option>
          <option value="home">Home Improvement</option><option value="auto">Auto</option><option value="other">Other</option>
        </select>
        <label for="loan-term">Term:</label>
        <select id="loan-term" name="term_months" required>
          <option value="12">12 Months</option><option value="24">24 Months</option>
          <option value="36">36 Months</option><option value="60">60 Months</option>
        </select>
      </fieldset>
      <label><input type="checkbox" name="consent" required /> I consent to a credit check and agree to the <a href="/terms">Terms</a></label>
      <button type="submit" data-testid="submit-application-btn" class="btn-primary">Submit Application</button>
    </form>
  </main>
</body>
</html>`,
  metadata: { complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

// ============================================================================
// GOVERNMENT (5 Fixtures)
// ============================================================================

const government001: CorpusEntry = {
  id: "government-001",
  name: "Government Service Portal",
  category: "government",
  url: "https://services.gov.example.org/portal",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Service Portal - GOV.example</title></head>
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <header role="banner">
    <div class="gov-banner" aria-label="Official government website">An official website of Example Government</div>
    <nav aria-label="Main navigation" data-testid="main-nav">
      <a href="/">GOV.example</a>
      <ul role="menubar">
        <li role="menuitem"><a href="/services">Services</a></li><li role="menuitem"><a href="/agencies">Agencies</a></li>
        <li role="menuitem"><a href="/forms">Forms</a></li><li role="menuitem"><a href="/contact">Contact</a></li>
      </ul>
      <form role="search" data-testid="search-form" action="/search">
        <input type="search" name="q" aria-label="Search government services" placeholder="Search..." />
        <button type="submit">Search</button>
      </form>
    </nav>
  </header>
  <main id="main-content">
    <h1>Government Services Portal</h1>
    <section data-testid="popular-services" aria-label="Popular services">
      <h2>Popular Services</h2>
      <nav aria-label="Service categories">
        <a href="/services/permits" data-testid="permits-link" class="service-card"><h3>Permits & Licenses</h3></a>
        <a href="/services/taxes" data-testid="taxes-link" class="service-card"><h3>Tax Services</h3></a>
        <a href="/services/benefits" data-testid="benefits-link" class="service-card"><h3>Benefits</h3></a>
        <a href="/services/records" data-testid="records-link" class="service-card"><h3>Vital Records</h3></a>
      </nav>
    </section>
    <section data-testid="status-check" aria-label="Check application status">
      <h2>Check Application Status</h2>
      <form data-testid="status-check-form" action="/status">
        <label for="tracking-number">Tracking Number:</label>
        <input type="text" id="tracking-number" name="tracking" required placeholder="e.g., GOV-2026-12345" />
        <button type="submit" data-testid="check-status-btn">Check Status</button>
      </form>
    </section>
  </main>
  <footer role="contentinfo"><a href="/accessibility">Accessibility</a><a href="/privacy">Privacy Policy</a><a href="/foia">FOIA</a></footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const government002: CorpusEntry = {
  id: "government-002",
  name: "Government Form Submission",
  category: "government",
  url: "https://services.gov.example.org/forms/general-inquiry",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>General Inquiry - GOV.example</title></head>
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">GOV.example</a><a href="/forms" aria-current="page">Forms</a></nav></header>
  <main id="main-content">
    <h1>General Inquiry Form</h1>
    <p>Use this form to submit a general inquiry to our department.</p>
    <form data-testid="inquiry-form" action="/api/forms/inquiry" method="post" aria-label="General inquiry form">
      <label for="inquiry-name">Full Name:</label>
      <input type="text" id="inquiry-name" name="name" required aria-required="true" autocomplete="name" />
      <label for="inquiry-email">Email Address:</label>
      <input type="email" id="inquiry-email" name="email" required aria-required="true" autocomplete="email" />
      <label for="inquiry-phone">Phone Number (optional):</label>
      <input type="tel" id="inquiry-phone" name="phone" autocomplete="tel" />
      <label for="inquiry-subject">Subject:</label>
      <select id="inquiry-subject" name="subject" required aria-required="true" data-testid="subject-select">
        <option value="">Select Subject</option><option value="permits">Permits</option>
        <option value="taxes">Taxes</option><option value="benefits">Benefits</option><option value="other">Other</option>
      </select>
      <label for="inquiry-message">Message:</label>
      <textarea id="inquiry-message" name="message" rows="6" required aria-required="true" maxlength="2000" data-testid="message-textarea"></textarea>
      <label for="inquiry-attachment">Attachment (optional):</label>
      <input type="file" id="inquiry-attachment" name="attachment" accept=".pdf,.doc,.docx,.jpg,.png" data-testid="file-input" />
      <label><input type="checkbox" name="consent" required aria-required="true" /> I certify that the information provided is accurate</label>
      <button type="submit" data-testid="submit-inquiry-btn" class="btn-primary">Submit Inquiry</button>
    </form>
  </main>
  <footer role="contentinfo"><p>Response time: 5-10 business days</p></footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const government003: CorpusEntry = {
  id: "government-003",
  name: "Application Status Check",
  category: "government",
  url: "https://services.gov.example.org/status",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Application Status - GOV.example</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">GOV.example</a><a href="/status" aria-current="page">Status</a></nav></header>
  <main>
    <h1>Check Application Status</h1>
    <form data-testid="status-form" action="/api/status" method="get" aria-label="Status check form">
      <label for="app-id">Application ID:</label>
      <input type="text" id="app-id" name="application_id" required placeholder="GOV-2026-XXXXX" data-testid="app-id-input" />
      <label for="dob-verify">Date of Birth (for verification):</label>
      <input type="date" id="dob-verify" name="dob" required data-testid="dob-input" />
      <button type="submit" data-testid="check-status-btn" class="btn-primary">Check Status</button>
    </form>
    <section data-testid="status-result" aria-label="Status result" aria-live="polite" hidden>
      <h2>Application Status</h2>
      <div class="status-card">
        <p>Application: <strong>GOV-2026-12345</strong></p>
        <p>Status: <span data-testid="status-badge" class="badge-pending">Under Review</span></p>
        <p>Submitted: March 10, 2026</p><p>Last Updated: March 15, 2026</p>
        <div class="progress-steps" role="list">
          <div role="listitem" aria-current="step">Submitted → Under Review → Decision → Complete</div>
        </div>
      </div>
    </section>
  </main>
  <footer role="contentinfo"><a href="/contact">Contact Us</a></footer>
</body>
</html>`,
  metadata: { complexity: "simple", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const government004: CorpusEntry = {
  id: "government-004",
  name: "Permit Application",
  category: "government",
  url: "https://services.gov.example.org/permits/apply",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Permit Application - GOV.example</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">GOV.example</a><a href="/permits" aria-current="page">Permits</a></nav></header>
  <main>
    <h1>Building Permit Application</h1>
    <div role="progressbar" aria-valuenow="1" aria-valuemin="1" aria-valuemax="3" data-testid="form-progress">Step 1 of 3: Property Information</div>
    <form data-testid="permit-form" action="/api/permits/apply" method="post" aria-label="Permit application">
      <fieldset><legend>Property Information</legend>
        <label for="property-address">Property Address:</label>
        <input type="text" id="property-address" name="property_address" required />
        <label for="parcel-number">Parcel Number:</label>
        <input type="text" id="parcel-number" name="parcel_number" required />
        <label for="property-type">Property Type:</label>
        <select id="property-type" name="property_type" required>
          <option value="residential">Residential</option><option value="commercial">Commercial</option><option value="industrial">Industrial</option>
        </select>
      </fieldset>
      <fieldset><legend>Project Details</legend>
        <label for="project-type">Project Type:</label>
        <select id="project-type" name="project_type" required data-testid="project-type-select">
          <option value="new-construction">New Construction</option><option value="renovation">Renovation</option>
          <option value="addition">Addition</option><option value="demolition">Demolition</option>
        </select>
        <label for="project-description">Description:</label>
        <textarea id="project-description" name="description" rows="4" required></textarea>
        <label for="estimated-cost">Estimated Cost ($):</label>
        <input type="number" id="estimated-cost" name="estimated_cost" required min="0" step="100" />
        <label for="start-date">Planned Start Date:</label>
        <input type="date" id="start-date" name="start_date" required />
      </fieldset>
      <fieldset><legend>Applicant Information</legend>
        <label for="applicant-name">Applicant Name:</label>
        <input type="text" id="applicant-name" name="applicant_name" required autocomplete="name" />
        <label for="applicant-phone">Phone:</label>
        <input type="tel" id="applicant-phone" name="phone" required autocomplete="tel" />
        <label for="applicant-email">Email:</label>
        <input type="email" id="applicant-email" name="email" required autocomplete="email" />
      </fieldset>
      <label><input type="checkbox" name="certified" required /> I certify all information is accurate under penalty of law</label>
      <button type="submit" data-testid="submit-permit-btn" class="btn-primary">Submit Application ($75 fee)</button>
    </form>
  </main>
</body>
</html>`,
  metadata: { complexity: "complex", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const government005: CorpusEntry = {
  id: "government-005",
  name: "Tax Filing Portal",
  category: "government",
  url: "https://tax.gov.example.org/file",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>File Taxes - GOV.example Tax Portal</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">Tax Portal</a><a href="/file" aria-current="page">File</a><a href="/status">Status</a><a href="/help">Help</a></nav></header>
  <main>
    <h1>File Your Taxes</h1>
    <form data-testid="tax-form" action="/api/tax/submit" method="post" aria-label="Tax filing form">
      <fieldset><legend>Filing Status</legend>
        <div role="radiogroup" aria-label="Filing status">
          <label><input type="radio" name="filing_status" value="single" required /> Single</label>
          <label><input type="radio" name="filing_status" value="married_joint" /> Married Filing Jointly</label>
          <label><input type="radio" name="filing_status" value="married_separate" /> Married Filing Separately</label>
          <label><input type="radio" name="filing_status" value="head_household" /> Head of Household</label>
        </div>
      </fieldset>
      <fieldset><legend>Income Information</legend>
        <label for="wages">Wages (W-2):</label>
        <input type="number" id="wages" name="wages" min="0" step="0.01" required inputmode="decimal" />
        <label for="interest">Interest Income:</label>
        <input type="number" id="interest" name="interest_income" min="0" step="0.01" inputmode="decimal" />
        <label for="other-income">Other Income:</label>
        <input type="number" id="other-income" name="other_income" min="0" step="0.01" inputmode="decimal" />
      </fieldset>
      <fieldset><legend>Deductions</legend>
        <div role="radiogroup" aria-label="Deduction type">
          <label><input type="radio" name="deduction_type" value="standard" required checked /> Standard Deduction ($14,600)</label>
          <label><input type="radio" name="deduction_type" value="itemized" /> Itemized Deductions</label>
        </div>
      </fieldset>
      <div data-testid="tax-summary" aria-label="Tax calculation summary">
        <p>Estimated Tax: <strong data-testid="tax-amount">$0.00</strong></p>
        <p>Estimated Refund: <strong data-testid="refund-amount">$0.00</strong></p>
      </div>
      <label><input type="checkbox" name="e_sign" required /> I declare under penalty of perjury that this return is correct</label>
      <button type="submit" data-testid="file-taxes-btn" class="btn-primary">File Tax Return</button>
    </form>
  </main>
</body>
</html>`,
  metadata: { complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

// ============================================================================
// BLOG (5 Fixtures)
// ============================================================================

const blog001: CorpusEntry = {
  id: "blog-001",
  name: "Blog Article",
  category: "blog",
  url: "https://blog.techwriter.com/posts/ai-agents-2026",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>AI Agents in 2026 - TechWriter Blog</title></head>
<body>
  <header role="banner">
    <nav aria-label="Main navigation" data-testid="main-nav">
      <a href="/">TechWriter</a>
      <ul><li><a href="/posts">Articles</a></li><li><a href="/topics">Topics</a></li><li><a href="/about">About</a></li></ul>
    </nav>
  </header>
  <main>
    <article data-testid="article" itemscope itemtype="https://schema.org/BlogPosting">
      <nav aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/posts">Articles</a></li><li aria-current="page">AI Agents in 2026</li></ol></nav>
      <header>
        <h1 itemprop="headline">The Rise of AI Agents in 2026</h1>
        <div class="meta">
          <span itemprop="author">By <a href="/authors/jane-doe">Jane Doe</a></span>
          <time itemprop="datePublished" datetime="2026-03-15">March 15, 2026</time>
          <span>5 min read</span>
        </div>
        <div data-testid="share-buttons" aria-label="Share article">
          <button data-testid="share-twitter" aria-label="Share on Twitter">Twitter</button>
          <button data-testid="share-linkedin" aria-label="Share on LinkedIn">LinkedIn</button>
          <button data-testid="share-copy" aria-label="Copy link">Copy Link</button>
        </div>
      </header>
      <div itemprop="articleBody" class="article-content" data-testid="article-body">
        <p>Artificial intelligence agents have evolved significantly...</p>
        <h2>Key Trends</h2><p>The most significant developments include...</p>
        <h2>Impact on Business</h2><p>Companies are adopting AI agents at an unprecedented rate...</p>
      </div>
      <footer>
        <div data-testid="article-tags" aria-label="Article tags">
          <a href="/topics/ai" rel="tag">AI</a><a href="/topics/agents" rel="tag">Agents</a><a href="/topics/tech" rel="tag">Technology</a>
        </div>
      </footer>
    </article>
    <nav data-testid="article-nav" aria-label="Article navigation">
      <a href="/posts/previous-post" rel="prev">← Previous: Machine Learning Basics</a>
      <a href="/posts/next-post" rel="next">Next: Building Your First Agent →</a>
    </nav>
  </main>
  <footer role="contentinfo"><a href="/privacy">Privacy</a><a href="/rss" data-testid="rss-link">RSS Feed</a></footer>
</body>
</html>`,
  metadata: { complexity: "simple", hasAuthentication: false, hasForms: false, hasNavigation: true, hasDynamicContent: false },
};

const blog002: CorpusEntry = {
  id: "blog-002",
  name: "Blog Comment Section",
  category: "blog",
  url: "https://blog.techwriter.com/posts/ai-agents-2026#comments",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Comments - AI Agents in 2026</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">TechWriter</a></nav></header>
  <main>
    <section data-testid="comments-section" aria-label="Comments">
      <h2>Comments (12)</h2>
      <div data-testid="comment-sort" aria-label="Sort comments">
        <label for="comment-sort-select">Sort by:</label>
        <select id="comment-sort-select" name="sort" data-testid="sort-select">
          <option value="newest">Newest First</option><option value="oldest">Oldest First</option><option value="popular">Most Popular</option>
        </select>
      </div>
      <div class="comments-list" role="list">
        <article class="comment" role="listitem" data-testid="comment-1">
          <header><strong>John S.</strong> — <time datetime="2026-03-16">1 day ago</time></header>
          <p>Great article! The section on autonomous agents was particularly insightful.</p>
          <div class="comment-actions">
            <button data-testid="like-comment-1" aria-label="Like this comment">👍 5</button>
            <button data-testid="reply-comment-1" aria-label="Reply to John S.">Reply</button>
            <button data-testid="report-comment-1" aria-label="Report this comment">Report</button>
          </div>
        </article>
      </div>
      <form data-testid="comment-form" action="/api/comments" method="post" aria-label="Post a comment">
        <h3>Leave a Comment</h3>
        <label for="comment-name">Name:</label>
        <input type="text" id="comment-name" name="name" required aria-required="true" />
        <label for="comment-email">Email (not published):</label>
        <input type="email" id="comment-email" name="email" required aria-required="true" />
        <label for="comment-text">Comment:</label>
        <textarea id="comment-text" name="comment" rows="4" required aria-required="true" data-testid="comment-textarea" maxlength="1000"></textarea>
        <label><input type="checkbox" name="notify" /> Notify me of replies</label>
        <button type="submit" data-testid="post-comment-btn" class="btn-primary">Post Comment</button>
      </form>
    </section>
  </main>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const blog003: CorpusEntry = {
  id: "blog-003",
  name: "Newsletter Signup",
  category: "blog",
  url: "https://blog.techwriter.com/newsletter",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Newsletter - TechWriter</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">TechWriter</a><a href="/newsletter" aria-current="page">Newsletter</a></nav></header>
  <main>
    <section data-testid="newsletter-hero" aria-label="Newsletter signup">
      <h1>Stay Updated</h1>
      <p>Get the latest articles on AI, tech trends, and engineering delivered to your inbox weekly.</p>
      <form data-testid="newsletter-form" action="/api/newsletter/subscribe" method="post" aria-label="Subscribe to newsletter">
        <label for="nl-email">Email Address:</label>
        <input type="email" id="nl-email" name="email" required aria-required="true" placeholder="you@example.com" data-testid="nl-email-input" />
        <label for="nl-name">First Name (optional):</label>
        <input type="text" id="nl-name" name="first_name" placeholder="Your name" />
        <fieldset><legend>Topics of Interest:</legend>
          <label><input type="checkbox" name="topics" value="ai" checked /> Artificial Intelligence</label>
          <label><input type="checkbox" name="topics" value="web" /> Web Development</label>
          <label><input type="checkbox" name="topics" value="devops" /> DevOps</label>
          <label><input type="checkbox" name="topics" value="security" /> Security</label>
        </fieldset>
        <label for="nl-frequency">Frequency:</label>
        <select id="nl-frequency" name="frequency" data-testid="frequency-select">
          <option value="weekly">Weekly Digest</option><option value="daily">Daily Updates</option><option value="monthly">Monthly Summary</option>
        </select>
        <label><input type="checkbox" name="consent" required aria-required="true" /> I agree to the <a href="/privacy">Privacy Policy</a></label>
        <button type="submit" data-testid="subscribe-btn" class="btn-primary">Subscribe</button>
      </form>
    </section>
    <section data-testid="past-issues" aria-label="Past issues">
      <h2>Recent Issues</h2>
      <ul><li><a href="/newsletter/issue-42">Issue #42 — March 10, 2026</a></li><li><a href="/newsletter/issue-41">Issue #41 — March 3, 2026</a></li></ul>
    </section>
  </main>
  <footer role="contentinfo"><p>You can unsubscribe at any time.</p></footer>
</body>
</html>`,
  metadata: { complexity: "simple", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const blog004: CorpusEntry = {
  id: "blog-004",
  name: "Author Page",
  category: "blog",
  url: "https://blog.techwriter.com/authors/jane-doe",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Jane Doe - TechWriter</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">TechWriter</a><a href="/authors">Authors</a></nav></header>
  <main>
    <section data-testid="author-profile" itemscope itemtype="https://schema.org/Person">
      <img src="/avatars/jane-doe.jpg" alt="Jane Doe" itemprop="image" />
      <h1 itemprop="name">Jane Doe</h1>
      <p itemprop="jobTitle">Senior Tech Writer & AI Researcher</p>
      <p itemprop="description">Jane covers AI, machine learning, and developer tools. Previously at Google and OpenAI.</p>
      <div data-testid="social-links" aria-label="Social media links">
        <a href="https://twitter.com/janedoe" aria-label="Jane Doe on Twitter" rel="me noopener" data-testid="twitter-link">Twitter</a>
        <a href="https://github.com/janedoe" aria-label="Jane Doe on GitHub" rel="me noopener" data-testid="github-link">GitHub</a>
        <a href="https://linkedin.com/in/janedoe" aria-label="Jane Doe on LinkedIn" rel="me noopener">LinkedIn</a>
      </div>
    </section>
    <section data-testid="author-articles" aria-label="Articles by Jane Doe">
      <h2>Articles by Jane Doe</h2>
      <article class="article-card"><a href="/posts/ai-agents-2026"><h3>The Rise of AI Agents in 2026</h3></a><time>Mar 15, 2026</time></article>
      <article class="article-card"><a href="/posts/ml-basics"><h3>Machine Learning Basics</h3></a><time>Mar 8, 2026</time></article>
      <article class="article-card"><a href="/posts/llm-guide"><h3>A Complete Guide to LLMs</h3></a><time>Feb 28, 2026</time></article>
    </section>
    <nav aria-label="Pagination"><a href="?page=1" aria-current="page">1</a><a href="?page=2">2</a></nav>
  </main>
  <footer role="contentinfo"><a href="/privacy">Privacy</a></footer>
</body>
</html>`,
  metadata: { complexity: "simple", hasAuthentication: false, hasForms: false, hasNavigation: true, hasDynamicContent: false },
};

const blog005: CorpusEntry = {
  id: "blog-005",
  name: "Blog Archive",
  category: "blog",
  url: "https://blog.techwriter.com/archive",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Archive - TechWriter</title></head>
<body>
  <header role="banner"><nav aria-label="Main navigation"><a href="/">TechWriter</a><a href="/archive" aria-current="page">Archive</a></nav></header>
  <main>
    <h1>Article Archive</h1>
    <form data-testid="archive-search" role="search" aria-label="Search articles">
      <input type="search" name="q" aria-label="Search articles" placeholder="Search archive..." data-testid="archive-search-input" />
      <button type="submit">Search</button>
    </form>
    <nav data-testid="archive-filters" aria-label="Filter by year">
      <a href="/archive/2026" aria-current="page">2026</a><a href="/archive/2025">2025</a><a href="/archive/2024">2024</a>
    </nav>
    <section data-testid="archive-list" aria-label="Articles">
      <h2>March 2026</h2>
      <ul role="list">
        <li><a href="/posts/ai-agents-2026">The Rise of AI Agents in 2026</a> — <time>Mar 15</time></li>
        <li><a href="/posts/ml-basics">Machine Learning Basics</a> — <time>Mar 8</time></li>
        <li><a href="/posts/web-trends">Web Development Trends</a> — <time>Mar 1</time></li>
      </ul>
      <h2>February 2026</h2>
      <ul role="list">
        <li><a href="/posts/llm-guide">A Complete Guide to LLMs</a> — <time>Feb 28</time></li>
        <li><a href="/posts/rust-intro">Introduction to Rust</a> — <time>Feb 20</time></li>
      </ul>
    </section>
    <nav aria-label="Pagination"><a href="?page=1" aria-current="page">1</a><a href="?page=2">2</a><a href="?page=3">3</a></nav>
  </main>
  <footer role="contentinfo"><a href="/rss">RSS Feed</a><a href="/privacy">Privacy</a></footer>
</body>
</html>`,
  metadata: { complexity: "simple", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

// ============================================================================
// SPA (5 Fixtures)
// ============================================================================

const spa001: CorpusEntry = {
  id: "spa-001",
  name: "React Dashboard App",
  category: "spa",
  url: "https://app.reactdashboard.dev/",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>React Dashboard</title></head>
<body>
  <div id="root" data-reactroot="">
    <div class="app-layout" data-testid="app-container">
      <aside class="sidebar" role="navigation" aria-label="App navigation" data-testid="sidebar">
        <a href="/" data-testid="logo" class="sidebar-logo">ReactDash</a>
        <nav><ul>
          <li><a href="/dashboard" aria-current="page" data-testid="nav-dashboard">Dashboard</a></li>
          <li><a href="/users" data-testid="nav-users">Users</a></li>
          <li><a href="/reports" data-testid="nav-reports">Reports</a></li>
          <li><a href="/settings" data-testid="nav-settings">Settings</a></li>
        </ul></nav>
      </aside>
      <main class="main-content">
        <header data-testid="topbar">
          <div class="search-wrapper">
            <input type="search" placeholder="Search..." aria-label="Search application" data-testid="global-search" />
          </div>
          <div data-testid="user-dropdown" class="user-menu">
            <button aria-haspopup="true" aria-expanded="false" data-testid="user-menu-btn">Admin ▼</button>
          </div>
        </header>
        <div data-testid="dashboard-content">
          <h1>Dashboard Overview</h1>
          <div class="grid" data-testid="metrics-grid">
            <div class="card" data-testid="card-users"><h2>Total Users</h2><span>12,345</span></div>
            <div class="card" data-testid="card-revenue"><h2>Revenue</h2><span>$98,765</span></div>
          </div>
          <div data-testid="chart-container" role="img" aria-label="Revenue chart for last 30 days">
            <canvas data-testid="revenue-chart"></canvas>
          </div>
          <button data-testid="refresh-btn" aria-label="Refresh dashboard data">Refresh Data</button>
        </div>
      </main>
    </div>
  </div>
</body>
</html>`,
  metadata: { framework: "react", complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const spa002: CorpusEntry = {
  id: "spa-002",
  name: "Vue Task Manager",
  category: "spa",
  url: "https://tasks.vueapp.dev/",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Vue Task Manager</title></head>
<body>
  <div id="app" data-v-app="">
    <header data-v-12345abc class="app-header" role="banner">
      <h1 data-v-12345abc>Vue Tasks</h1>
      <nav data-v-12345abc aria-label="Main navigation">
        <router-link to="/tasks" data-v-12345abc class="router-link-active">Tasks</router-link>
        <router-link to="/calendar" data-v-12345abc>Calendar</router-link>
        <router-link to="/settings" data-v-12345abc>Settings</router-link>
      </nav>
    </header>
    <main data-v-67890def>
      <div data-v-67890def class="task-controls">
        <form data-v-67890def data-testid="add-task-form" @submit.prevent="addTask">
          <input data-v-67890def type="text" v-model="newTask" placeholder="Add a new task..." aria-label="New task" data-testid="task-input" />
          <select data-v-67890def v-model="priority" aria-label="Task priority" data-testid="priority-select">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
          <button data-v-67890def type="submit" data-testid="add-task-btn" class="btn-primary">Add Task</button>
        </form>
        <div data-v-67890def class="filters" data-testid="task-filters">
          <button data-v-67890def :class="{active: filter === 'all'}" @click="filter = 'all'" data-testid="filter-all">All</button>
          <button data-v-67890def :class="{active: filter === 'active'}" @click="filter = 'active'" data-testid="filter-active">Active</button>
          <button data-v-67890def :class="{active: filter === 'completed'}" @click="filter = 'completed'" data-testid="filter-completed">Completed</button>
        </div>
      </div>
      <ul data-v-67890def class="task-list" role="list" data-testid="task-list">
        <li data-v-aabbccdd v-for="task in filteredTasks" :key="task.id" class="task-item" role="listitem">
          <input data-v-aabbccdd type="checkbox" :checked="task.done" @change="toggleTask(task.id)" :aria-label="'Mark ' + task.title + ' as done'" />
          <span data-v-aabbccdd>{{ task.title }}</span>
          <button data-v-aabbccdd @click="deleteTask(task.id)" aria-label="Delete task" data-testid="delete-task">×</button>
        </li>
      </ul>
      <p data-v-67890def aria-live="polite">{{ activeTasks }} tasks remaining</p>
    </main>
  </div>
</body>
</html>`,
  metadata: { framework: "vue", complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const spa003: CorpusEntry = {
  id: "spa-003",
  name: "Angular Admin Panel",
  category: "spa",
  url: "https://admin.angularapp.dev/",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Angular Admin Panel</title></head>
<body>
  <app-root ng-version="19.0.0">
    <app-layout>
      <app-sidebar>
        <nav aria-label="Admin navigation" class="ng-sidebar">
          <a routerLink="/admin/dashboard" routerLinkActive="active" data-testid="nav-dashboard">Dashboard</a>
          <a routerLink="/admin/users" routerLinkActive="active" data-testid="nav-users">Users</a>
          <a routerLink="/admin/content" routerLinkActive="active" data-testid="nav-content">Content</a>
          <a routerLink="/admin/analytics" routerLinkActive="active" data-testid="nav-analytics">Analytics</a>
          <a routerLink="/admin/settings" routerLinkActive="active" data-testid="nav-settings">Settings</a>
        </nav>
      </app-sidebar>
      <app-main>
        <app-toolbar>
          <div class="toolbar">
            <form class="ng-search" role="search">
              <input type="search" placeholder="Search..." [(ngModel)]="searchQuery" aria-label="Search admin panel" data-testid="admin-search" />
            </form>
            <button (click)="toggleNotifications()" aria-label="Notifications" data-testid="notifications-btn" [attr.aria-expanded]="notificationsOpen">🔔</button>
            <div class="user-info" data-testid="user-info"><span>Admin User</span>
              <button (click)="logout()" data-testid="logout-btn" aria-label="Logout">Logout</button>
            </div>
          </div>
        </app-toolbar>
        <router-outlet></router-outlet>
        <app-user-table *ngIf="currentRoute === 'users'">
          <section aria-label="User management" data-testid="user-management">
            <h1>User Management</h1>
            <button (click)="openCreateUser()" data-testid="create-user-btn" class="btn-primary">+ Create User</button>
            <table aria-label="Users table" data-testid="users-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
              <tbody><tr *ngFor="let user of users">
                <td>{{user.name}}</td><td>{{user.email}}</td><td>{{user.role}}</td>
                <td><button (click)="editUser(user)" aria-label="Edit user" data-testid="edit-user">Edit</button>
                <button (click)="deleteUser(user)" aria-label="Delete user" class="btn-danger" data-testid="delete-user">Delete</button></td>
              </tr></tbody>
            </table>
          </section>
        </app-user-table>
      </app-main>
    </app-layout>
  </app-root>
</body>
</html>`,
  metadata: { framework: "angular", complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const spa004: CorpusEntry = {
  id: "spa-004",
  name: "Svelte Notes App",
  category: "spa",
  url: "https://notes.svelteapp.dev/",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Svelte Notes</title></head>
<body>
  <div id="svelte-app" data-svelte-h>
    <header data-svelte-h="header" role="banner">
      <h1>Svelte Notes</h1>
      <nav aria-label="Main navigation">
        <a href="/notes" class="active" data-testid="nav-notes">Notes</a>
        <a href="/tags" data-testid="nav-tags">Tags</a>
        <a href="/trash" data-testid="nav-trash">Trash</a>
      </nav>
    </header>
    <main data-svelte-h="main" class="notes-layout">
      <aside data-svelte-h="sidebar" class="notes-sidebar" aria-label="Notes list">
        <form data-testid="search-notes-form" role="search">
          <input type="search" placeholder="Search notes..." aria-label="Search notes" data-testid="search-notes-input" />
        </form>
        <button data-testid="new-note-btn" class="btn-primary" aria-label="Create new note">+ New Note</button>
        <ul role="list" data-testid="notes-list">
          <li role="listitem" class="note-item active" data-testid="note-1"><a href="/notes/1">Meeting Notes</a></li>
          <li role="listitem" class="note-item" data-testid="note-2"><a href="/notes/2">Shopping List</a></li>
          <li role="listitem" class="note-item" data-testid="note-3"><a href="/notes/3">Project Ideas</a></li>
        </ul>
      </aside>
      <section data-svelte-h="editor" class="note-editor" aria-label="Note editor" data-testid="note-editor">
        <div class="editor-toolbar" role="toolbar" aria-label="Formatting options">
          <button data-testid="bold-btn" aria-label="Bold" aria-pressed="false">B</button>
          <button data-testid="italic-btn" aria-label="Italic" aria-pressed="false">I</button>
          <button data-testid="list-btn" aria-label="Bullet list">•</button>
        </div>
        <input type="text" class="note-title" value="Meeting Notes" aria-label="Note title" data-testid="note-title-input" />
        <textarea class="note-content" aria-label="Note content" data-testid="note-content-textarea" rows="20">Discussion points for the team meeting...</textarea>
        <div class="note-meta">
          <label for="note-tags">Tags:</label>
          <input type="text" id="note-tags" placeholder="Add tags..." aria-label="Add tags" data-testid="tags-input" />
        </div>
        <div class="note-actions">
          <button data-testid="save-note-btn" class="btn-primary" aria-label="Save note">Save</button>
          <button data-testid="delete-note-btn" class="btn-danger" aria-label="Delete note">Delete</button>
          <button data-testid="share-note-btn" aria-label="Share note">Share</button>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`,
  metadata: { framework: "svelte", complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const spa005: CorpusEntry = {
  id: "spa-005",
  name: "Next.js Blog Platform",
  category: "spa",
  url: "https://blog.nextjsapp.dev/",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Next.js Blog Platform</title></head>
<body>
  <div id="__next" data-reactroot="">
    <header role="banner" className="next-header">
      <nav aria-label="Main navigation" data-testid="main-nav">
        <a href="/" data-testid="logo">NextBlog</a>
        <ul><li><a href="/posts">Posts</a></li><li><a href="/create">Write</a></li><li><a href="/profile">Profile</a></li></ul>
        <form role="search" data-testid="search-form" action="/search"><input type="search" name="q" aria-label="Search posts" placeholder="Search..." /><button type="submit">Search</button></form>
      </nav>
    </header>
    <main>
      <section data-testid="create-post" aria-label="Create a new post">
        <h1>Write a New Post</h1>
        <form data-testid="post-form" aria-label="Create post form">
          <label htmlFor="post-title">Title:</label>
          <input type="text" id="post-title" name="title" required aria-required="true" placeholder="Your post title" data-testid="title-input" />
          <label htmlFor="post-category">Category:</label>
          <select id="post-category" name="category" data-testid="category-select">
            <option value="tech">Technology</option><option value="design">Design</option><option value="business">Business</option>
          </select>
          <label htmlFor="post-content">Content:</label>
          <div data-testid="rich-editor" role="textbox" aria-label="Post content editor" contentEditable="true" aria-multiline="true" className="editor-area">Start writing...</div>
          <label htmlFor="post-tags">Tags:</label>
          <input type="text" id="post-tags" name="tags" placeholder="Comma-separated tags" data-testid="tags-input" />
          <label htmlFor="cover-image">Cover Image:</label>
          <input type="file" id="cover-image" name="cover" accept="image/*" data-testid="cover-upload" />
          <div className="form-actions">
            <button type="button" data-testid="save-draft-btn">Save as Draft</button>
            <button type="submit" data-testid="publish-btn" className="btn-primary">Publish</button>
          </div>
        </form>
      </section>
    </main>
    <footer role="contentinfo"><p>Built with Next.js</p></footer>
  </div>
</body>
</html>`,
  metadata: { framework: "nextjs", complexity: "medium", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

// ============================================================================
// WORDPRESS (5 Fixtures)
// ============================================================================

const wordpress001: CorpusEntry = {
  id: "wordpress-001",
  name: "WordPress Classic Theme",
  category: "wordpress",
  url: "https://blog.wpsite.com/",
  html: `<!DOCTYPE html>
<html lang="en" class="wp-custom-logo">
<head><title>WP Classic Blog</title></head>
<body class="home blog wp-embed-responsive">
  <div id="page" class="site">
    <header id="masthead" class="site-header" role="banner">
      <div class="site-branding"><a href="/" class="custom-logo-link" rel="home"><img src="/logo.png" alt="WP Classic Blog" class="custom-logo" /></a></div>
      <nav id="site-navigation" class="main-navigation" role="navigation" aria-label="Primary menu">
        <button class="menu-toggle" aria-controls="primary-menu" aria-expanded="false">Menu</button>
        <div class="menu-main-container">
          <ul id="primary-menu" class="menu">
            <li class="menu-item menu-item-type-post_type current-menu-item"><a href="/" aria-current="page">Home</a></li>
            <li class="menu-item"><a href="/about">About</a></li>
            <li class="menu-item"><a href="/contact">Contact</a></li>
          </ul>
        </div>
      </nav>
    </header>
    <div id="content" class="site-content">
      <main id="primary" class="content-area">
        <article class="post type-post status-publish hentry" data-testid="post-1">
          <header class="entry-header"><h2 class="entry-title"><a href="/hello-world">Hello World</a></h2>
            <div class="entry-meta"><span class="posted-on"><time class="entry-date published" datetime="2026-03-15">March 15, 2026</time></span></div>
          </header>
          <div class="entry-content"><p>Welcome to WordPress. This is your first post.</p></div>
          <footer class="entry-footer"><span class="cat-links">Categories: <a href="/category/uncategorized">Uncategorized</a></span></footer>
        </article>
      </main>
      <aside id="secondary" class="widget-area" role="complementary" aria-label="Blog sidebar">
        <section class="widget widget_search">
          <form role="search" class="search-form" action="/" data-testid="wp-search-form">
            <label><span class="screen-reader-text">Search for:</span>
              <input type="search" class="search-field" placeholder="Search..." name="s" />
            </label>
            <button type="submit" class="search-submit">Search</button>
          </form>
        </section>
        <section class="widget widget_recent_entries"><h2 class="widget-title">Recent Posts</h2>
          <ul><li><a href="/hello-world">Hello World</a></li></ul>
        </section>
      </aside>
    </div>
  </div>
  <footer id="colophon" class="site-footer" role="contentinfo">
    <div class="site-info"><a href="https://wordpress.org/">Proudly powered by WordPress</a></div>
  </footer>
</body>
</html>`,
  metadata: { framework: "wordpress", complexity: "simple", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const wordpress002: CorpusEntry = {
  id: "wordpress-002",
  name: "WooCommerce Product",
  category: "wordpress",
  url: "https://store.wpsite.com/product/organic-coffee",
  html: `<!DOCTYPE html>
<html lang="en" class="woocommerce">
<head><title>Organic Coffee - WP Store</title></head>
<body class="single-product woocommerce-page">
  <header class="site-header" role="banner">
    <nav class="woocommerce-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> / <a href="/shop">Shop</a> / Organic Coffee
    </nav>
    <nav class="main-navigation" role="navigation" aria-label="Main menu">
      <ul class="menu"><li><a href="/">Home</a></li><li><a href="/shop">Shop</a></li><li><a href="/cart">Cart</a></li></ul>
    </nav>
    <a href="/cart" class="cart-contents" data-testid="wc-cart-link" aria-label="View cart">Cart (0) — $0.00</a>
  </header>
  <main>
    <div class="product type-product" data-testid="wc-product">
      <div class="woocommerce-product-gallery" data-testid="product-gallery">
        <img src="/coffee.jpg" alt="Organic Coffee Beans" class="wp-post-image" />
      </div>
      <div class="summary entry-summary">
        <h1 class="product_title entry-title">Organic Fair Trade Coffee Beans</h1>
        <p class="price"><span class="woocommerce-Price-amount">$18.99</span></p>
        <div class="woocommerce-product-rating" aria-label="Rated 4.5 out of 5">★★★★½</div>
        <div class="woocommerce-product-details__short-description"><p>Premium organic coffee beans from Colombia.</p></div>
        <form class="cart" method="post" data-testid="wc-add-to-cart-form" action="/cart/add">
          <label for="wc-quantity">Quantity:</label>
          <input type="number" id="wc-quantity" class="input-text qty text" name="quantity" value="1" min="1" max="10" aria-label="Product quantity" />
          <label for="wc-grind">Grind:</label>
          <select id="wc-grind" name="attribute_grind" data-testid="grind-select" aria-label="Select grind type">
            <option value="whole">Whole Bean</option><option value="medium">Medium Grind</option><option value="fine">Fine Grind</option>
          </select>
          <button type="submit" class="single_add_to_cart_button button" data-testid="wc-add-to-cart-btn">Add to cart</button>
        </form>
      </div>
    </div>
    <div class="woocommerce-tabs wc-tabs-wrapper" data-testid="product-tabs">
      <ul class="tabs wc-tabs" role="tablist">
        <li role="tab" aria-selected="true"><a href="#tab-description">Description</a></li>
        <li role="tab"><a href="#tab-reviews">Reviews (23)</a></li>
      </ul>
    </div>
  </main>
  <footer class="site-footer" role="contentinfo"><p>&copy; WP Store</p></footer>
</body>
</html>`,
  metadata: { framework: "wordpress", complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const wordpress003: CorpusEntry = {
  id: "wordpress-003",
  name: "WordPress Contact Form",
  category: "wordpress",
  url: "https://blog.wpsite.com/contact",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Contact Us - WP Site</title></head>
<body class="page-template page contact-page">
  <header class="site-header" role="banner">
    <nav class="main-navigation" role="navigation" aria-label="Main menu">
      <ul class="menu"><li><a href="/">Home</a></li><li><a href="/about">About</a></li><li class="current-menu-item"><a href="/contact" aria-current="page">Contact</a></li></ul>
    </nav>
  </header>
  <main class="site-main">
    <article class="page type-page">
      <h1 class="entry-title">Contact Us</h1>
      <div class="entry-content">
        <div class="wpcf7" data-testid="contact-form-7">
          <form class="wpcf7-form" action="/wp-json/contact-form-7/v1/contact-forms/1/feedback" method="post" data-testid="cf7-form" aria-label="Contact form">
            <p><label>Your Name (required)<br />
              <input type="text" name="your-name" class="wpcf7-form-control wpcf7-text wpcf7-validates-as-required" aria-required="true" aria-invalid="false" /></label></p>
            <p><label>Your Email (required)<br />
              <input type="email" name="your-email" class="wpcf7-form-control wpcf7-text wpcf7-email wpcf7-validates-as-required wpcf7-validates-as-email" aria-required="true" /></label></p>
            <p><label>Subject<br />
              <input type="text" name="your-subject" class="wpcf7-form-control wpcf7-text" /></label></p>
            <p><label>Your Message<br />
              <textarea name="your-message" class="wpcf7-form-control wpcf7-textarea" cols="40" rows="10" aria-required="true"></textarea></label></p>
            <p><input type="submit" value="Send" class="wpcf7-form-control wpcf7-submit" data-testid="cf7-submit" /></p>
          </form>
        </div>
      </div>
    </article>
  </main>
  <footer class="site-footer" role="contentinfo"><p>&copy; WP Site</p></footer>
</body>
</html>`,
  metadata: { framework: "wordpress", complexity: "simple", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const wordpress004: CorpusEntry = {
  id: "wordpress-004",
  name: "WordPress Blog Post",
  category: "wordpress",
  url: "https://blog.wpsite.com/2026/03/tech-trends",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Tech Trends 2026 - WP Blog</title></head>
<body class="single single-post">
  <header class="site-header" role="banner">
    <nav class="main-navigation" role="navigation" aria-label="Main menu">
      <ul class="menu"><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul>
    </nav>
  </header>
  <main class="site-main">
    <article class="post type-post status-publish hentry" data-testid="wp-post">
      <header class="entry-header">
        <h1 class="entry-title">Tech Trends in 2026</h1>
        <div class="entry-meta">
          <span class="posted-on">Posted on <time class="entry-date published" datetime="2026-03-10">March 10, 2026</time></span>
          <span class="byline"> by <a href="/author/admin" class="author vcard">Admin</a></span>
          <span class="cat-links">in <a href="/category/technology">Technology</a></span>
        </div>
      </header>
      <div class="entry-content wp-block-post-content">
        <p class="wp-block-paragraph">The technology landscape continues to evolve rapidly...</p>
        <h2 class="wp-block-heading">AI and Machine Learning</h2>
        <p class="wp-block-paragraph">Artificial intelligence has become ubiquitous...</p>
        <figure class="wp-block-image"><img src="/tech.jpg" alt="Technology illustration" /></figure>
      </div>
      <footer class="entry-footer">
        <span class="tags-links">Tags: <a href="/tag/ai" rel="tag">AI</a>, <a href="/tag/tech" rel="tag">Tech</a></span>
      </footer>
    </article>
    <nav class="post-navigation" aria-label="Post navigation">
      <a href="/2026/03/prev-post" rel="prev">← Previous Post</a>
      <a href="/2026/03/next-post" rel="next">Next Post →</a>
    </nav>
    <div id="comments" class="comments-area">
      <h2 class="comments-title">3 Comments</h2>
      <ol class="comment-list"><li class="comment"><p>Great insights!</p></li></ol>
      <div id="respond" class="comment-respond">
        <h3 class="comment-reply-title">Leave a Reply</h3>
        <form id="commentform" class="comment-form" action="/wp-comments-post.php" method="post" data-testid="wp-comment-form">
          <p class="comment-form-comment"><label for="wp-comment">Comment</label>
            <textarea id="wp-comment" name="comment" rows="6" required></textarea></p>
          <p class="comment-form-author"><label for="wp-author">Name</label>
            <input type="text" id="wp-author" name="author" required /></p>
          <p class="comment-form-email"><label for="wp-email">Email</label>
            <input type="email" id="wp-email" name="email" required /></p>
          <p class="form-submit"><input type="submit" class="submit" value="Post Comment" data-testid="wp-comment-submit" /></p>
        </form>
      </div>
    </div>
  </main>
  <aside class="widget-area" role="complementary"><section class="widget widget_search">
    <form role="search" class="search-form"><input type="search" class="search-field" name="s" /><button type="submit">Search</button></form>
  </section></aside>
</body>
</html>`,
  metadata: { framework: "wordpress", complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const wordpress005: CorpusEntry = {
  id: "wordpress-005",
  name: "WordPress Custom Page",
  category: "wordpress",
  url: "https://business.wpsite.com/services",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Our Services - WP Business</title></head>
<body class="page-template page-template-full-width">
  <header class="site-header" role="banner">
    <nav class="main-navigation" role="navigation" aria-label="Main menu">
      <ul class="menu"><li><a href="/">Home</a></li><li class="current-menu-item"><a href="/services" aria-current="page">Services</a></li>
        <li><a href="/portfolio">Portfolio</a></li><li><a href="/contact">Contact</a></li></ul>
    </nav>
  </header>
  <main class="site-main">
    <article class="page type-page">
      <h1 class="entry-title">Our Services</h1>
      <div class="entry-content">
        <section class="wp-block-group service-block" data-testid="service-1">
          <h2 class="wp-block-heading">Web Development</h2><p>Custom websites built with modern technologies.</p>
          <a href="/services/web-development" class="wp-block-button__link" data-testid="learn-more-1">Learn More</a>
        </section>
        <section class="wp-block-group service-block" data-testid="service-2">
          <h2 class="wp-block-heading">SEO Optimization</h2><p>Improve your search engine rankings.</p>
          <a href="/services/seo" class="wp-block-button__link" data-testid="learn-more-2">Learn More</a>
        </section>
        <section class="wp-block-group service-block" data-testid="service-3">
          <h2 class="wp-block-heading">Digital Marketing</h2><p>Reach your audience effectively.</p>
          <a href="/services/marketing" class="wp-block-button__link" data-testid="learn-more-3">Learn More</a>
        </section>
        <section class="wp-block-group cta-block" data-testid="cta-section">
          <h2>Ready to Get Started?</h2>
          <a href="/contact" class="wp-block-button__link btn-primary" data-testid="cta-btn" role="button">Contact Us Today</a>
        </section>
      </div>
    </article>
  </main>
  <footer class="site-footer" role="contentinfo"><p>&copy; 2026 WP Business</p></footer>
</body>
</html>`,
  metadata: { framework: "wordpress", complexity: "simple", hasAuthentication: false, hasForms: false, hasNavigation: true, hasDynamicContent: false },
};

// ============================================================================
// SHOPIFY (5 Fixtures)
// ============================================================================

const shopify001: CorpusEntry = {
  id: "shopify-001",
  name: "Shopify Product Page",
  category: "shopify",
  url: "https://store.shopifyexample.com/products/leather-wallet",
  html: `<!DOCTYPE html>
<html lang="en" class="shopify-features">
<head><title>Leather Wallet - Shopify Store</title></head>
<body class="template-product">
  <header class="section-header" role="banner">
    <nav aria-label="Main navigation" class="site-nav"><ul class="site-nav__list">
      <li><a href="/">Home</a></li><li><a href="/collections/all">Shop All</a></li><li><a href="/pages/about">About</a></li>
    </ul></nav>
    <a href="/cart" class="site-header__cart" data-testid="shopify-cart-link" aria-label="Cart">Cart (0)</a>
  </header>
  <main class="main-content" role="main">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/collections/accessories">Accessories</a> / Leather Wallet</nav>
    <section class="shopify-section product-section" data-testid="shopify-product">
      <div class="product-single__media"><img src="/wallet.jpg" alt="Premium Leather Wallet" class="product-featured-img" /></div>
      <div class="product-single__meta">
        <h1 class="product-single__title">Premium Leather Wallet</h1>
        <div class="product-single__price" data-testid="product-price"><span class="money">$49.99</span></div>
        <div class="product-single__description"><p>Handcrafted genuine leather bifold wallet with RFID protection.</p></div>
        <form data-testid="shopify-product-form" action="/cart/add" method="post" class="product-form" id="product-form">
          <div class="selector-wrapper"><label for="product-select-color">Color:</label>
            <select id="product-select-color" name="id" class="single-option-selector" data-testid="color-select">
              <option value="brown">Brown</option><option value="black">Black</option><option value="tan">Tan</option>
            </select></div>
          <div class="product-form__item"><label for="shopify-qty">Quantity:</label>
            <input type="number" id="shopify-qty" name="quantity" value="1" min="1" class="product-form__input" data-testid="qty-input" /></div>
          <button type="submit" class="product-form__cart-submit btn" data-testid="shopify-add-to-cart">Add to Cart</button>
          <button type="button" class="shopify-payment-button" data-testid="shopify-buy-now">Buy it now</button>
        </form>
      </div>
    </section>
  </main>
  <footer class="site-footer" role="contentinfo"><nav aria-label="Footer"><a href="/policies/privacy-policy">Privacy Policy</a><a href="/policies/refund-policy">Refund Policy</a></nav></footer>
</body>
</html>`,
  metadata: { framework: "shopify", complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const shopify002: CorpusEntry = {
  id: "shopify-002",
  name: "Shopify Collection Page",
  category: "shopify",
  url: "https://store.shopifyexample.com/collections/accessories",
  html: `<!DOCTYPE html>
<html lang="en" class="shopify-features">
<head><title>Accessories - Shopify Store</title></head>
<body class="template-collection">
  <header class="section-header" role="banner">
    <nav aria-label="Main navigation" class="site-nav"><ul><li><a href="/">Home</a></li><li><a href="/collections/all">Shop</a></li></ul></nav>
  </header>
  <main class="main-content" role="main">
    <div class="collection-hero"><h1 class="collection-hero__title">Accessories</h1><p>Explore our handcrafted collection.</p></div>
    <div class="collection-toolbar" data-testid="collection-toolbar">
      <label for="sort-by">Sort by:</label>
      <select id="sort-by" class="collection-sort" data-testid="sort-select" aria-label="Sort products">
        <option value="best-selling">Best Selling</option><option value="price-ascending">Price: Low to High</option>
        <option value="price-descending">Price: High to Low</option><option value="created-descending">Newest</option>
      </select>
      <div class="collection-filter" data-testid="collection-filters">
        <label><input type="checkbox" name="filter" value="leather" /> Leather</label>
        <label><input type="checkbox" name="filter" value="canvas" /> Canvas</label>
      </div>
    </div>
    <div class="collection-grid" data-testid="collection-grid" role="list">
      <div class="grid-product" role="listitem" data-testid="grid-item-1">
        <a href="/products/leather-wallet"><img src="/wallet.jpg" alt="Leather Wallet" /><h2 class="grid-product__title">Leather Wallet</h2></a>
        <span class="grid-product__price">$49.99</span>
        <button data-testid="quick-add-1" aria-label="Add Leather Wallet to cart">Quick Add</button>
      </div>
      <div class="grid-product" role="listitem" data-testid="grid-item-2">
        <a href="/products/canvas-bag"><img src="/bag.jpg" alt="Canvas Bag" /><h2 class="grid-product__title">Canvas Bag</h2></a>
        <span class="grid-product__price">$79.99</span>
        <button data-testid="quick-add-2" aria-label="Add Canvas Bag to cart">Quick Add</button>
      </div>
    </div>
    <nav aria-label="Pagination" class="pagination"><span aria-current="page">1</span><a href="?page=2">2</a></nav>
  </main>
  <footer class="site-footer" role="contentinfo"><p>&copy; Shopify Store</p></footer>
</body>
</html>`,
  metadata: { framework: "shopify", complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const shopify003: CorpusEntry = {
  id: "shopify-003",
  name: "Shopify Cart Page",
  category: "shopify",
  url: "https://store.shopifyexample.com/cart",
  html: `<!DOCTYPE html>
<html lang="en" class="shopify-features">
<head><title>Cart - Shopify Store</title></head>
<body class="template-cart">
  <header class="section-header" role="banner"><nav aria-label="Main navigation"><a href="/">Home</a><a href="/cart" aria-current="page">Cart</a></nav></header>
  <main class="main-content" role="main">
    <h1>Your Cart</h1>
    <form action="/cart" method="post" data-testid="shopify-cart-form" aria-label="Shopping cart">
      <table class="cart-table" role="table" aria-label="Cart items">
        <thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Total</th></tr></thead>
        <tbody>
          <tr class="cart-item" data-testid="cart-item-1">
            <td><a href="/products/leather-wallet">Leather Wallet — Brown</a></td><td>$49.99</td>
            <td><input type="number" name="updates[]" value="1" min="0" aria-label="Quantity" data-testid="cart-qty-1" /></td>
            <td>$49.99</td>
          </tr>
        </tbody>
      </table>
      <div class="cart-footer" data-testid="cart-footer">
        <p class="cart-subtotal">Subtotal: <span data-testid="cart-subtotal">$49.99</span></p>
        <p class="cart-note">Shipping & taxes calculated at checkout</p>
        <div class="cart-note-input"><label for="cart-note">Order Notes:</label><textarea id="cart-note" name="note" rows="2"></textarea></div>
        <button type="submit" name="update" data-testid="update-cart">Update Cart</button>
        <button type="submit" name="checkout" class="btn cart-checkout-btn" data-testid="shopify-checkout-btn">Checkout</button>
      </div>
    </form>
  </main>
  <footer class="site-footer" role="contentinfo"><p>&copy; Shopify Store</p></footer>
</body>
</html>`,
  metadata: { framework: "shopify", complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const shopify004: CorpusEntry = {
  id: "shopify-004",
  name: "Shopify Account Page",
  category: "shopify",
  url: "https://store.shopifyexample.com/account",
  html: `<!DOCTYPE html>
<html lang="en" class="shopify-features">
<head><title>My Account - Shopify Store</title></head>
<body class="template-customers-account">
  <header class="section-header" role="banner"><nav aria-label="Main navigation"><a href="/">Home</a><a href="/account" aria-current="page">Account</a></nav></header>
  <main class="main-content" role="main">
    <h1>My Account</h1>
    <section data-testid="account-details" aria-label="Account details">
      <h2>Account Details</h2>
      <p>Name: Jane Doe</p><p>Email: jane@example.com</p>
      <a href="/account/addresses" data-testid="manage-addresses">Manage Addresses</a>
    </section>
    <section data-testid="order-history" aria-label="Order history">
      <h2>Order History</h2>
      <table role="table" aria-label="Orders">
        <thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          <tr data-testid="order-1"><td><a href="/account/orders/1001">#1001</a></td><td>Mar 10, 2026</td>
            <td><span class="order-status">Fulfilled</span></td><td>$49.99</td></tr>
        </tbody>
      </table>
    </section>
    <form data-testid="address-form" action="/account/addresses" method="post" aria-label="Add new address">
      <h2>Add New Address</h2>
      <label for="addr-name">Name:</label><input type="text" id="addr-name" name="name" required />
      <label for="addr-address1">Address:</label><input type="text" id="addr-address1" name="address1" required />
      <label for="addr-city">City:</label><input type="text" id="addr-city" name="city" required />
      <label for="addr-zip">ZIP:</label><input type="text" id="addr-zip" name="zip" required />
      <button type="submit" data-testid="add-address-btn">Add Address</button>
    </form>
    <a href="/account/logout" data-testid="logout-link">Log Out</a>
  </main>
</body>
</html>`,
  metadata: { framework: "shopify", complexity: "medium", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const shopify005: CorpusEntry = {
  id: "shopify-005",
  name: "Shopify Search Page",
  category: "shopify",
  url: "https://store.shopifyexample.com/search?q=wallet",
  html: `<!DOCTYPE html>
<html lang="en" class="shopify-features">
<head><title>Search: wallet - Shopify Store</title></head>
<body class="template-search">
  <header class="section-header" role="banner"><nav aria-label="Main navigation"><a href="/">Home</a></nav></header>
  <main class="main-content" role="main">
    <h1>Search Results</h1>
    <form role="search" action="/search" data-testid="shopify-search-form" class="search-form" aria-label="Search store">
      <input type="search" name="q" value="wallet" aria-label="Search" class="search-input" data-testid="search-input" />
      <select name="type" data-testid="search-type-select" aria-label="Search type">
        <option value="product">Products</option><option value="article">Blog Posts</option><option value="page">Pages</option>
      </select>
      <button type="submit" data-testid="search-submit-btn">Search</button>
    </form>
    <p aria-live="polite" data-testid="search-count">3 results for "wallet"</p>
    <div class="search-results" data-testid="search-results" role="list">
      <div class="search-result" role="listitem">
        <a href="/products/leather-wallet"><h2>Leather Wallet</h2></a><span>$49.99</span>
        <button data-testid="search-add-1" aria-label="Add Leather Wallet to cart">Add to Cart</button>
      </div>
      <div class="search-result" role="listitem">
        <a href="/products/card-holder"><h2>Card Holder</h2></a><span>$29.99</span>
        <button data-testid="search-add-2" aria-label="Add Card Holder to cart">Add to Cart</button>
      </div>
    </div>
  </main>
  <footer class="site-footer" role="contentinfo"><p>&copy; Shopify Store</p></footer>
</body>
</html>`,
  metadata: { framework: "shopify", complexity: "simple", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

// ============================================================================
// FRAMEWORK (5 Fixtures)
// ============================================================================

const framework001: CorpusEntry = {
  id: "framework-001",
  name: "Angular Material Login",
  category: "framework",
  url: "https://app.matdesign.dev/login",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Login - Angular Material App</title></head>
<body>
  <app-root>
    <mat-toolbar color="primary" role="toolbar"><span>Material App</span></mat-toolbar>
    <main class="mat-app-background">
      <mat-card class="login-card" data-testid="login-card">
        <mat-card-header><mat-card-title>Sign In</mat-card-title></mat-card-header>
        <mat-card-content>
          <form data-testid="mat-login-form" aria-label="Login form">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email</mat-label>
              <input matInput type="email" name="email" required aria-required="true" data-testid="mat-email-input" autocomplete="email" />
              <mat-error>Please enter a valid email</mat-error>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Password</mat-label>
              <input matInput type="password" name="password" required aria-required="true" data-testid="mat-password-input" autocomplete="current-password" />
              <mat-icon matSuffix>visibility</mat-icon>
            </mat-form-field>
            <mat-checkbox name="remember" data-testid="remember-checkbox">Remember me</mat-checkbox>
            <button mat-raised-button color="primary" type="submit" data-testid="mat-login-btn" class="full-width">Sign In</button>
          </form>
          <mat-divider></mat-divider>
          <button mat-button data-testid="mat-forgot-password" color="accent">Forgot Password?</button>
          <button mat-stroked-button data-testid="mat-google-login" class="full-width">
            <mat-icon>login</mat-icon> Sign in with Google
          </button>
          <p>Don't have an account? <a href="/register" data-testid="register-link" mat-button>Register</a></p>
        </mat-card-content>
      </mat-card>
    </main>
  </app-root>
</body>
</html>`,
  metadata: { framework: "angular", complexity: "medium", hasAuthentication: true, hasForms: true, hasNavigation: false, hasDynamicContent: false },
};

const framework002: CorpusEntry = {
  id: "framework-002",
  name: "React MUI Data Table",
  category: "framework",
  url: "https://app.muidemo.dev/users",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Users - MUI App</title></head>
<body>
  <div id="root" data-reactroot="">
    <header class="MuiAppBar-root MuiAppBar-colorPrimary" role="banner">
      <div class="MuiToolbar-root">
        <h6 class="MuiTypography-root">MUI Admin</h6>
        <div class="MuiBox-root" style="flex-grow:1"></div>
        <button class="MuiIconButton-root" aria-label="Notifications" data-testid="mui-notifications"><span class="MuiBadge-root">🔔<span class="MuiBadge-badge">3</span></span></button>
        <button class="MuiIconButton-root" aria-label="Account" data-testid="mui-account-btn" aria-haspopup="true">👤</button>
      </div>
    </header>
    <nav class="MuiDrawer-root" aria-label="Main navigation">
      <div class="MuiList-root" role="list">
        <a href="/dashboard" class="MuiListItemButton-root" role="listitem"><span class="MuiListItemText-primary">Dashboard</span></a>
        <a href="/users" class="MuiListItemButton-root Mui-selected" role="listitem" aria-current="page"><span class="MuiListItemText-primary">Users</span></a>
        <a href="/settings" class="MuiListItemButton-root" role="listitem"><span class="MuiListItemText-primary">Settings</span></a>
      </div>
    </nav>
    <main class="MuiBox-root">
      <div class="MuiPaper-root" data-testid="user-table-container">
        <div class="MuiToolbar-root">
          <h2 class="MuiTypography-root">Users</h2>
          <div class="MuiTextField-root"><input type="search" placeholder="Search users..." aria-label="Search users" data-testid="mui-search" class="MuiInputBase-input" /></div>
          <button class="MuiButton-root MuiButton-contained" data-testid="add-user-btn">+ Add User</button>
        </div>
        <table class="MuiTable-root" aria-label="Users table" data-testid="mui-table">
          <thead><tr class="MuiTableRow-head"><th class="MuiTableCell-head">Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
          <tbody><tr class="MuiTableRow-root" data-testid="user-row-1">
            <td class="MuiTableCell-root">John Doe</td><td>john@example.com</td><td>Admin</td>
            <td><button class="MuiIconButton-root" aria-label="Edit user" data-testid="edit-user-1">✏️</button>
            <button class="MuiIconButton-root" aria-label="Delete user" data-testid="delete-user-1">🗑️</button></td>
          </tr></tbody>
        </table>
        <div class="MuiTablePagination-root" data-testid="mui-pagination"><span>1–10 of 100</span>
          <button aria-label="Previous page" disabled>◀</button><button aria-label="Next page">▶</button>
        </div>
      </div>
    </main>
  </div>
</body>
</html>`,
  metadata: { framework: "react", complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const framework003: CorpusEntry = {
  id: "framework-003",
  name: "Vue Vuetify Form",
  category: "framework",
  url: "https://app.vuetifydemo.dev/form",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Form Demo - Vuetify App</title></head>
<body>
  <div id="app" data-v-app="">
    <div class="v-application">
      <nav class="v-navigation-drawer" aria-label="App navigation" data-testid="vuetify-nav">
        <div class="v-list"><a href="/dashboard" class="v-list-item">Dashboard</a><a href="/form" class="v-list-item v-list-item--active" aria-current="page">Form</a></div>
      </nav>
      <header class="v-app-bar" role="banner"><div class="v-toolbar__title">Vuetify App</div></header>
      <main class="v-main">
        <div class="v-container">
          <h1 class="text-h4">Contact Form</h1>
          <form data-testid="vuetify-form" class="v-form" aria-label="Contact form">
            <div class="v-text-field" data-testid="v-name-field">
              <label for="v-name" class="v-label">Full Name</label>
              <input type="text" id="v-name" name="name" required class="v-field__input" aria-required="true" />
            </div>
            <div class="v-text-field" data-testid="v-email-field">
              <label for="v-email" class="v-label">Email</label>
              <input type="email" id="v-email" name="email" required class="v-field__input" aria-required="true" />
            </div>
            <div class="v-select" data-testid="v-subject-select">
              <label for="v-subject" class="v-label">Subject</label>
              <select id="v-subject" name="subject" class="v-field__input" data-testid="subject-select">
                <option value="general">General Inquiry</option><option value="support">Technical Support</option><option value="billing">Billing</option>
              </select>
            </div>
            <div class="v-textarea" data-testid="v-message-field">
              <label for="v-message" class="v-label">Message</label>
              <textarea id="v-message" name="message" rows="5" required class="v-field__input" aria-required="true"></textarea>
            </div>
            <div class="v-checkbox" data-testid="v-terms"><label><input type="checkbox" name="terms" required /> I agree to terms</label></div>
            <button type="submit" class="v-btn v-btn--elevated" data-testid="v-submit-btn" color="primary">Submit</button>
            <button type="reset" class="v-btn v-btn--outlined" data-testid="v-reset-btn">Reset</button>
          </form>
        </div>
      </main>
    </div>
  </div>
</body>
</html>`,
  metadata: { framework: "vue", complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

const framework004: CorpusEntry = {
  id: "framework-004",
  name: "Tailwind UI Landing Page",
  category: "framework",
  url: "https://www.tailwindlanding.dev/",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Tailwind UI Landing Page</title></head>
<body class="antialiased">
  <header class="bg-white shadow" role="banner">
    <nav class="mx-auto max-w-7xl px-4" aria-label="Main navigation">
      <div class="flex h-16 justify-between">
        <a href="/" class="flex items-center font-bold text-xl" data-testid="tw-logo">TailwindApp</a>
        <div class="hidden md:flex md:space-x-8">
          <a href="/features" class="text-gray-600 hover:text-gray-900">Features</a>
          <a href="/pricing" class="text-gray-600 hover:text-gray-900">Pricing</a>
          <a href="/docs" class="text-gray-600 hover:text-gray-900">Docs</a>
        </div>
        <div class="flex items-center space-x-4">
          <a href="/login" class="text-gray-600" data-testid="tw-login">Log in</a>
          <a href="/signup" class="rounded-md bg-indigo-600 px-4 py-2 text-white" data-testid="tw-signup" role="button">Get Started</a>
        </div>
      </div>
    </nav>
  </header>
  <main>
    <section class="bg-gradient-to-r from-indigo-500 to-purple-600 py-20" data-testid="hero-section">
      <div class="mx-auto max-w-4xl text-center text-white">
        <h1 class="text-5xl font-bold">Build faster with TailwindApp</h1>
        <p class="mt-4 text-xl">The modern framework for building beautiful user interfaces.</p>
        <div class="mt-8 flex justify-center space-x-4">
          <a href="/signup" class="rounded-lg bg-white px-6 py-3 text-indigo-600 font-semibold" data-testid="hero-cta" role="button">Start Free Trial</a>
          <a href="/demo" class="rounded-lg border-2 border-white px-6 py-3 text-white" data-testid="hero-demo" role="button">Watch Demo</a>
        </div>
      </div>
    </section>
    <section class="py-16" data-testid="features-section" aria-label="Features">
      <h2 class="text-3xl font-bold text-center">Features</h2>
      <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        <div class="p-6 bg-white rounded-lg shadow"><h3 class="font-semibold">Fast Development</h3><p>Ship faster with utility-first CSS.</p></div>
        <div class="p-6 bg-white rounded-lg shadow"><h3 class="font-semibold">Responsive Design</h3><p>Build for every screen size.</p></div>
        <div class="p-6 bg-white rounded-lg shadow"><h3 class="font-semibold">Dark Mode</h3><p>Built-in dark mode support.</p></div>
      </div>
    </section>
    <section class="bg-gray-50 py-16" data-testid="newsletter-section" aria-label="Newsletter">
      <div class="max-w-xl mx-auto text-center">
        <h2 class="text-2xl font-bold">Stay Updated</h2>
        <form data-testid="tw-newsletter-form" class="mt-4 flex" aria-label="Newsletter signup">
          <input type="email" name="email" required placeholder="your@email.com" class="flex-1 rounded-l-md border px-4 py-2" aria-label="Email address" data-testid="tw-email-input" />
          <button type="submit" class="rounded-r-md bg-indigo-600 px-6 py-2 text-white" data-testid="tw-subscribe-btn">Subscribe</button>
        </form>
      </div>
    </section>
  </main>
  <footer class="bg-gray-900 text-gray-400 py-8" role="contentinfo">
    <nav aria-label="Footer"><a href="/privacy" class="hover:text-white">Privacy</a><a href="/terms" class="hover:text-white">Terms</a></nav>
  </footer>
</body>
</html>`,
  metadata: { complexity: "medium", hasAuthentication: false, hasForms: true, hasNavigation: true, hasDynamicContent: false },
};

const framework005: CorpusEntry = {
  id: "framework-005",
  name: "Bootstrap Dashboard",
  category: "framework",
  url: "https://app.bootstrapdemo.dev/dashboard",
  html: `<!DOCTYPE html>
<html lang="en">
<head><title>Bootstrap Dashboard</title></head>
<body>
  <nav class="navbar navbar-expand-lg navbar-dark bg-dark" role="navigation" aria-label="Main navigation">
    <a class="navbar-brand" href="/">BS Dashboard</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarNav">
      <ul class="navbar-nav me-auto">
        <li class="nav-item"><a class="nav-link active" href="/dashboard" aria-current="page">Dashboard</a></li>
        <li class="nav-item"><a class="nav-link" href="/reports">Reports</a></li>
        <li class="nav-item"><a class="nav-link" href="/users">Users</a></li>
      </ul>
      <form class="d-flex" role="search" data-testid="bs-search-form">
        <input class="form-control me-2" type="search" placeholder="Search" aria-label="Search" data-testid="bs-search-input" />
        <button class="btn btn-outline-light" type="submit">Search</button>
      </form>
      <div class="dropdown ms-3">
        <button class="btn btn-outline-light dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" data-testid="bs-user-dropdown">Admin</button>
        <ul class="dropdown-menu dropdown-menu-end">
          <li><a class="dropdown-item" href="/profile">Profile</a></li>
          <li><a class="dropdown-item" href="/settings">Settings</a></li>
          <li><hr class="dropdown-divider" /></li>
          <li><a class="dropdown-item" href="/logout" data-testid="bs-logout">Logout</a></li>
        </ul>
      </div>
    </div>
  </nav>
  <div class="container-fluid">
    <div class="row">
      <nav id="sidebar" class="col-md-3 col-lg-2 d-md-block bg-light sidebar" aria-label="Sidebar">
        <div class="list-group">
          <a href="/dashboard" class="list-group-item list-group-item-action active" aria-current="page">Dashboard</a>
          <a href="/analytics" class="list-group-item list-group-item-action">Analytics</a>
          <a href="/exports" class="list-group-item list-group-item-action">Exports</a>
        </div>
      </nav>
      <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4">
        <h1>Dashboard</h1>
        <div class="row" data-testid="metrics-row">
          <div class="col-md-4"><div class="card"><div class="card-body"><h5 class="card-title">Users</h5><p class="card-text display-4">1,234</p></div></div></div>
          <div class="col-md-4"><div class="card"><div class="card-body"><h5 class="card-title">Revenue</h5><p class="card-text display-4">$56K</p></div></div></div>
          <div class="col-md-4"><div class="card"><div class="card-body"><h5 class="card-title">Orders</h5><p class="card-text display-4">89</p></div></div></div>
        </div>
        <div class="mt-4" data-testid="chart-area" role="img" aria-label="Monthly revenue chart"><canvas></canvas></div>
        <button class="btn btn-primary mt-3" data-testid="export-btn">Export Report</button>
      </main>
    </div>
  </div>
</body>
</html>`,
  metadata: { framework: "bootstrap", complexity: "complex", hasAuthentication: true, hasForms: true, hasNavigation: true, hasDynamicContent: true },
};

// ============================================================================
// CORPUS ARRAY
// ============================================================================

const CORPUS: CorpusEntry[] = [
  // Ecommerce
  ecommerce001, ecommerce002, ecommerce003, ecommerce004, ecommerce005,
  // SaaS
  saas001, saas002, saas003, saas004, saas005,
  // Healthcare
  healthcare001, healthcare002, healthcare003, healthcare004, healthcare005,
  // Finance
  finance001, finance002, finance003, finance004, finance005,
  // Government
  government001, government002, government003, government004, government005,
  // Blog
  blog001, blog002, blog003, blog004, blog005,
  // SPA
  spa001, spa002, spa003, spa004, spa005,
  // WordPress
  wordpress001, wordpress002, wordpress003, wordpress004, wordpress005,
  // Shopify
  shopify001, shopify002, shopify003, shopify004, shopify005,
  // Framework
  framework001, framework002, framework003, framework004, framework005,
];

// ============================================================================
// EXPORTS
// ============================================================================

export function getCorpus(): CorpusEntry[] {
  return CORPUS;
}

export function getCorpusByCategory(category: CorpusCategory): CorpusEntry[] {
  return CORPUS.filter((entry) => entry.category === category);
}

export function getCorpusEntry(id: string): CorpusEntry | undefined {
  return CORPUS.find((entry) => entry.id === id);
}
