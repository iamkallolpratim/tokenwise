# API

Call `POST /v2/orders` at https://api.acme.example/v2/orders with the `order_id` and `customerRef` fields.   
Config lives in `config/app.yaml` and types in src/types/order.ts.

## Types

```ts
interface Order { order_id: string; customerRef: string; totalCents: number }
```

## Types (copy)

```ts
interface Order { order_id: string; customerRef: string; totalCents: number }
```
