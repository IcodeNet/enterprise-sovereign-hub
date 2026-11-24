interface RoutingCase {
  query: string;
  expectedMethod: RetrievalMethod;
}

type RetrievalMethod = "hybrid" | "graph" | "tenant-sharded";

function chooseRetrievalMethod(query: string): RetrievalMethod {
  const q = query.toLowerCase();

  // Relationship/path language maps to graph retrieval.
  if (
    ["held at", "protected by", "relationship", "graph", "entity"].some((token) =>
      q.includes(token),
    )
  ) {
    return "graph";
  }

  // Exact IDs and mixed "tools + id" asks benefit from hybrid retrieval.
  if (/\bacc-\d{3,}\b/.test(q) || /#ac-\d{4}-[a-z]\b/.test(q)) {
    return "hybrid";
  }

  // Tenant/account scope language maps to tenant-sharded retrieval.
  if (
    ["tenant", "customer", "my account", "for customer", "portfolio for"].some((token) =>
      q.includes(token),
    )
  ) {
    return "tenant-sharded";
  }

  // Safe default for general grounded lookup.
  return "hybrid";
}

function runRoutingAccuracy(cases: RoutingCase[]): number {
  const correct = cases.filter(
    (testCase) => chooseRetrievalMethod(testCase.query) === testCase.expectedMethod,
  ).length;
  return cases.length === 0 ? 0 : correct / cases.length;
}

const defaultCases: RoutingCase[] = [
  {
    query: "What exact tools power the hub and Account ID #AC-9042-X?",
    expectedMethod: "hybrid",
  },
  {
    query: "Where is account ACC-4081 held and what protection applies?",
    expectedMethod: "hybrid",
  },
  {
    query: "Show graph relationship path for ACC-4081 to regulator",
    expectedMethod: "graph",
  },
  {
    query: "Find data for customer customer-001 accounts",
    expectedMethod: "tenant-sharded",
  },
  {
    query: "What products are available for tenant alpha?",
    expectedMethod: "tenant-sharded",
  },
  {
    query: "Explain entity relationship for Partner Bank C",
    expectedMethod: "graph",
  },
];

function main() {
  const accuracy = runRoutingAccuracy(defaultCases);

  console.log("--- Retrieval Router Accuracy (TS) ---");
  for (const testCase of defaultCases) {
    const actual = chooseRetrievalMethod(testCase.query);
    console.log(`query=${JSON.stringify(testCase.query)}`);
    console.log(`expected=${testCase.expectedMethod}, actual=${actual}`);
  }

  console.log(`routing_accuracy=${(accuracy * 100).toFixed(2)}%`);
  if (accuracy < 1) {
    throw new Error("routing accuracy gate failed");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { chooseRetrievalMethod, runRoutingAccuracy, type RetrievalMethod, type RoutingCase };
