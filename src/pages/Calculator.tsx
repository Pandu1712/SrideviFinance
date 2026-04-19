import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const Calculator = () => {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState(true);

  // Finance-specific calculations
  const [loanAmount, setLoanAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [tenure, setTenure] = useState("");
  const [emi, setEmi] = useState<string | null>(null);

  const handleNumber = (num: string) => {
    if (newNumber) {
      setDisplay(num);
      setNewNumber(false);
    } else {
      setDisplay(display === "0" ? num : display + num);
    }
  };

  const handleOp = (operator: string) => {
    const current = parseFloat(display);
    if (prev !== null && op) {
      const result = calculate(prev, current, op);
      setDisplay(String(result));
      setPrev(result);
    } else {
      setPrev(current);
    }
    setOp(operator);
    setNewNumber(true);
  };

  const calculate = (a: number, b: number, operator: string): number => {
    switch (operator) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b !== 0 ? a / b : 0;
      case "%": return (a * b) / 100;
      default: return b;
    }
  };

  const handleEquals = () => {
    if (prev !== null && op) {
      const current = parseFloat(display);
      const result = calculate(prev, current, op);
      setDisplay(String(result));
      setPrev(null);
      setOp(null);
      setNewNumber(true);
    }
  };

  const handleClear = () => {
    setDisplay("0");
    setPrev(null);
    setOp(null);
    setNewNumber(true);
  };

  const calculateEMI = () => {
    const P = parseFloat(loanAmount);
    const r = parseFloat(interestRate) / 12 / 100;
    const n = parseFloat(tenure);
    if (!P || !r || !n) return;
    const emiVal = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    setEmi(`₹${emiVal.toFixed(2)} / month\nTotal: ₹${(emiVal * n).toFixed(2)}\nInterest: ₹${((emiVal * n) - P).toFixed(2)}`);
  };

  const buttons = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "%", "+"];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Calculator</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Basic Calculator</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 rounded-lg bg-muted p-4 text-right">
              <p className="text-xs text-muted-foreground">{prev !== null ? `${prev} ${op}` : ""}</p>
              <p className="text-3xl font-bold font-mono">{display}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Button variant="destructive" className="col-span-2" onClick={handleClear}>Clear</Button>
              <Button variant="outline" className="col-span-2" onClick={() => setDisplay(display.slice(0, -1) || "0")}>⌫</Button>
              {buttons.map(b => (
                <Button
                  key={b}
                  variant={["+", "-", "×", "÷", "%"].includes(b) ? "outline" : "secondary"}
                  onClick={() => ["+", "-", "×", "÷", "%"].includes(b) ? handleOp(b) : handleNumber(b)}
                  className="h-12 text-lg"
                >
                  {b}
                </Button>
              ))}
              <Button onClick={handleEquals} className="col-span-4 h-12 text-lg bg-accent text-accent-foreground">=</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>EMI Calculator</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Loan Amount (₹)</label>
              <Input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} placeholder="100000" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Interest Rate (% per year)</label>
              <Input type="number" value={interestRate} onChange={e => setInterestRate(e.target.value)} placeholder="12" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Tenure (months)</label>
              <Input type="number" value={tenure} onChange={e => setTenure(e.target.value)} placeholder="12" />
            </div>
            <Button onClick={calculateEMI} className="w-full bg-accent text-accent-foreground">Calculate EMI</Button>
            {emi && (
              <div className="rounded-lg bg-muted p-4">
                <pre className="text-sm font-medium whitespace-pre-wrap">{emi}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Calculator;
