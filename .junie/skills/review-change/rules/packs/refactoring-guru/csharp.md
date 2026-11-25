---
language: csharp
prefix: CS
version: 1.0.0
---

# Refactoring.Guru and SourceMaking: C# rules

Rules for `.cs` files. Written in this project's own words; follow the source links for the full background.

### CS-008 — Primitive obsession

- **severity**: suggestion
- **status**: active
- **applies-to**: domain models, method signatures
- **look-for**: ids, money, email addresses, currencies or units passed around as raw `string` / `decimal` / `int`, with the same validation repeated in several places
- **why**: values are easy to swap by mistake (a customer id passed as an order id) and rules are scattered
- **fix**: introduce small value types (`record struct OrderId(Guid Value)`, `Money`) that validate once
- **sources**: https://refactoring.guru/smells/primitive-obsession, https://medium.com/@dgallivan23/the-10-most-common-c-code-smells-and-how-to-fix-them-6d58e57419aa

```csharp
// bad
void Refund(string orderId, decimal amount, string currency) { ... }
// good
void Refund(OrderId orderId, Money amount) { ... }
```

### CS-009 — Growing switch on type or kind

- **severity**: suggestion
- **status**: active
- **applies-to**: switch statements/expressions, if-else chains
- **look-for**: a new `case` added to a switch on an enum, string or type that selects behaviour, when the same switch exists in several places
- **why**: every new kind requires editing all switches; one missed place becomes a bug
- **fix**: move the behaviour into polymorphic classes or a strategy registered per kind
- **sources**: https://refactoring.guru/smells/switch-statements, https://refactoring.guru/design-patterns/strategy/csharp/example

```csharp
// bad
decimal Fee(Shipping s) => s.Kind switch { "dhl" => 5, "ups" => 7, "fedex" => 9, _ => 0 };
// good
interface IShippingFee { decimal For(Shipment s); }   // DhlFee, UpsFee, FedexFee registered in DI
```

### CS-011 — Mutable static state

- **severity**: minor
- **status**: active
- **applies-to**: static fields, hand-written singletons
- **look-for**: new `static` non-readonly fields, static collections that are modified, or a hand-rolled singleton holding state
- **why**: shared across requests and tests, causes race conditions and order-dependent tests
- **fix**: register the type as a singleton in DI and keep state in an instance; use concurrent or immutable types if sharing is required
- **sources**: https://refactoring.guru/design-patterns/singleton/csharp/example

```csharp
// bad
public static class Cache { public static Dictionary<string, User> Users = new(); }
// good
services.AddSingleton<IUserCache, UserCache>();   // UserCache uses ConcurrentDictionary internally
```

### CS-012 — Public mutable fields or setters on domain types

- **severity**: suggestion
- **status**: active
- **applies-to**: entities, value objects, DTOs used inside the domain
- **look-for**: public fields, or public setters on properties that must keep an invariant (status, totals, collections)
- **why**: any code can put the object into an invalid state; invariants spread to callers
- **fix**: use `init` or private setters and methods that enforce the rule; expose collections as `IReadOnlyList<T>`
- **sources**: https://refactoring.guru/encapsulate-field, https://refactoring.guru/encapsulate-collection

```csharp
// bad
public List<OrderLine> Lines { get; set; } = new();
// good
private readonly List<OrderLine> _lines = new();
public IReadOnlyList<OrderLine> Lines => _lines;
public void AddLine(OrderLine line) { ... }
```

### CS-018 — Constructor with too many dependencies or parameters

- **severity**: suggestion
- **status**: active
- **applies-to**: constructors
- **look-for**: a constructor that now takes more than about five services, or many optional configuration parameters
- **why**: signals a class with too many responsibilities, or objects that are hard to create correctly
- **fix**: split the class by responsibility; for complex object creation use a builder or an options object
- **sources**: https://refactoring.guru/design-patterns/builder/csharp/example, https://refactoring.guru/smells/large-class

```csharp
// bad
public ReportService(IDb db, IMail mail, ISms sms, IPdf pdf, ICsv csv, IClock clock, ILogger log) { }
// good
public ReportService(IReportData data, IReportExporter exporter, IReportNotifier notifier) { }
```
