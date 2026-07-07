# JWT JSON Server

A simple Express-based JSON server with JWT authentication and file-backed data.

Data is stored in `db.json` with top-level `users`, `products`, and `cart`
collections.

## Endpoints

- `GET /health` — health check
- `POST /login` — login with demo credentials
  - email: `admin@example.com`
  - password: `password123`
- `GET /users` — protected endpoint that lists users without passwords
- `POST /users` — create a user
- `GET /products` — fetch products from `db.json`, populating from dummyjson once if empty
- `POST /products` — protected endpoint that creates a product
- `PATCH /products/:id` — protected endpoint that updates a product
- `DELETE /products/:id` — protected endpoint that removes a product and related cart items
- `GET /cart` — protected endpoint that lists cart items
- `POST /cart` — protected endpoint that adds a product to the cart
- `PATCH /cart/:id` — protected endpoint that updates cart item quantity
- `DELETE /cart/:id` — protected endpoint that removes a cart item

## Run

```bash
npm install
npm start
```

Use the returned JWT token in the `Authorization: Bearer <token>` header to access protected endpoints.
