import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface DateBreakdown {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalMonths: number;
}

const Calculator = () => {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState(true);

  // Interest & Days Calculator States
  const [amount, setAmount] = useState("10000");
  const [fromDate, setFromDate] = useState("2026-01-01");
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
  
  const [monthlyRate, setMonthlyRate] = useState("2");
  const [dailyRate, setDailyRate] = useState("");
  const [compoundRate, setCompoundRate] = useState("");

  const [calculationBasis, setCalculationBasis] = useState<"all-days" | "months-days" | "months-only">("months-days");
  const [is360DaysBasis, setIs360DaysBasis] = useState(false);

  // Outputs
  const [breakdown, setBreakdown] = useState<DateBreakdown | null>(null);
  const [interestResult, setInterestResult] = useState<{
    type: "Simple" | "Compound";
    interest: number;
    total: number;
  } | null>(null);

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

  const buttons = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "%", "+"];

  // Core Financial Interest Calculation
  const calculateDateDiff = (fromStr: string, toStr: string): DateBreakdown => {
    const from = new Date(fromStr);
    const to = new Date(toStr);

    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
      return { years: 0, months: 0, days: 0, totalDays: 0, totalMonths: 0 };
    }

    const diffTime = Math.abs(to.getTime() - from.getTime());
    let totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (is360DaysBasis) {
      const y1 = from.getFullYear();
      const m1 = from.getMonth() + 1;
      const d1 = Math.min(30, from.getDate());

      const y2 = to.getFullYear();
      const m2 = to.getMonth() + 1;
      const d2 = Math.min(30, to.getDate());

      totalDays = (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
    }

    let years = to.getFullYear() - from.getFullYear();
    let months = to.getMonth() - from.getMonth();
    let days = to.getDate() - from.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonth = new Date(to.getFullYear(), to.getMonth(), 0);
      days += prevMonth.getDate();
    }

    if (months < 0) {
      years -= 1;
      months += 12;
    }

    const totalMonths = years * 12 + months + (days / 30);

    return { years, months, days, totalDays, totalMonths };
  };

  const handleCalculateInterest = (type: "Simple" | "Compound") => {
    const P = parseFloat(amount);
    if (isNaN(P) || P <= 0) {
      toast.error("Please enter a valid loan amount.");
      return;
    }

    const diff = calculateDateDiff(fromDate, toDate);
    setBreakdown(diff);

    let calculatedInterest = 0;
    const mRate = parseFloat(monthlyRate) || 0;
    const dRate = parseFloat(dailyRate) || (mRate / 30);
    const cRate = parseFloat(compoundRate) || mRate;

    if (type === "Simple") {
      if (calculationBasis === "all-days") {
        // Daily rate basis
        calculatedInterest = P * (dRate / 100) * diff.totalDays;
      } else if (calculationBasis === "months-days") {
        // Combined Months & Days basis
        calculatedInterest = P * (mRate / 100) * diff.totalMonths;
      } else {
        // Only Months basis (truncates remainder days)
        const fullMonths = diff.years * 12 + diff.months;
        calculatedInterest = P * (mRate / 100) * fullMonths;
      }
    } else {
      // Compound Interest
      const baseMonths = calculationBasis === "months-only" 
        ? (diff.years * 12 + diff.months)
        : diff.totalMonths;
      
      calculatedInterest = P * (Math.pow(1 + (cRate / 100), baseMonths) - 1);
    }

    setInterestResult({
      type,
      interest: parseFloat(calculatedInterest.toFixed(2)),
      total: parseFloat((P + calculatedInterest).toFixed(2))
    });

    toast.success(`${type} Interest computed successfully.`);
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-800 border-b pb-2">Calculator Portal</h1>
      <div className="grid gap-6 lg:grid-cols-12 items-stretch">
        
        {/* Left Side: Basic Calculator */}
        <Card className="lg:col-span-5 bg-white border border-zinc-200 shadow-md">
          <CardHeader className="bg-zinc-50 border-b py-4">
            <CardTitle className="text-md font-bold text-slate-700">Basic Calculator</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="mb-4 rounded-lg bg-zinc-100 p-4 text-right border border-zinc-300">
              <p className="text-xs text-slate-500 h-4">{prev !== null ? `${prev} ${op}` : ""}</p>
              <p className="text-3xl font-bold font-mono text-slate-900">{display}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Button variant="destructive" className="col-span-2 text-xs font-bold" onClick={handleClear}>Clear</Button>
              <Button variant="outline" className="col-span-2 text-xs font-bold" onClick={() => setDisplay(display.slice(0, -1) || "0")}>⌫</Button>
              {buttons.map(b => (
                <Button
                  key={b}
                  variant={["+", "-", "×", "÷", "%"].includes(b) ? "outline" : "secondary"}
                  onClick={() => ["+", "-", "×", "÷", "%"].includes(b) ? handleOp(b) : handleNumber(b)}
                  className="h-10 text-md font-bold"
                >
                  {b}
                </Button>
              ))}
              <Button onClick={handleEquals} className="col-span-4 h-10 text-md font-bold bg-amber-500 hover:bg-amber-600 text-white">=</Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Side: Micro-Finance Interest & Days Calculator */}
        <Card className="lg:col-span-7 bg-white border border-zinc-200 shadow-md flex flex-col">
          <CardHeader className="bg-zinc-50 border-b py-4">
            <CardTitle className="text-md font-bold text-slate-700">Interest & Days Calculator</CardTitle>
          </CardHeader>
          
          <CardContent className="p-4 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              
              {/* Row 1: Amount & 360 Basis */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">Principal Amount (₹)</Label>
                  <Input 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    className="h-9 text-xs font-bold"
                  />
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={is360DaysBasis}
                      onChange={e => setIs360DaysBasis(e.target.checked)}
                      className="rounded border-zinc-300 text-amber-500 focus:ring-amber-500 h-4 w-4"
                    />
                    360 Days Basis (30d / mo)
                  </label>
                </div>
              </div>

              {/* Row 2: Date From & To */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">From Date</Label>
                  <Input 
                    type="date" 
                    value={fromDate} 
                    onChange={e => setFromDate(e.target.value)} 
                    className="h-9 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">To Date</Label>
                  <Input 
                    type="date" 
                    value={toDate} 
                    onChange={e => setToDate(e.target.value)} 
                    className="h-9 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Row 3: Interest Rates */}
              <div className="grid grid-cols-3 gap-2 border-y border-zinc-200 py-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-black text-slate-600 block">Monthly Rate (%)</Label>
                  <Input 
                    type="number" 
                    value={monthlyRate} 
                    onChange={e => setMonthlyRate(e.target.value)} 
                    placeholder="2"
                    className="h-8 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-black text-slate-600 block">Daily Rate (%)</Label>
                  <Input 
                    type="number" 
                    value={dailyRate} 
                    onChange={e => setDailyRate(e.target.value)} 
                    placeholder="e.g. 0.06"
                    className="h-8 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-black text-slate-600 block">Compound Rate (%)</Label>
                  <Input 
                    type="number" 
                    value={compoundRate} 
                    onChange={e => setCompoundRate(e.target.value)} 
                    placeholder="e.g. 2"
                    className="h-8 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Row 4: Calculation Basis Radio buttons */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-bold text-slate-700">Calculation Basis</Label>
                <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="radio" 
                      name="basis" 
                      checked={calculationBasis === "months-days"}
                      onChange={() => setCalculationBasis("months-days")}
                      className="text-amber-500 focus:ring-amber-500 h-3.5 w-3.5"
                    />
                    Months & Days Based
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="radio" 
                      name="basis" 
                      checked={calculationBasis === "all-days"}
                      onChange={() => setCalculationBasis("all-days")}
                      className="text-amber-500 focus:ring-amber-500 h-3.5 w-3.5"
                    />
                    All Days Based
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="radio" 
                      name="basis" 
                      checked={calculationBasis === "months-only"}
                      onChange={() => setCalculationBasis("months-only")}
                      className="text-amber-500 focus:ring-amber-500 h-3.5 w-3.5"
                    />
                    Only Months Basis
                  </label>
                </div>
              </div>

            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-4">
              <Button 
                onClick={() => handleCalculateInterest("Simple")} 
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-2 shadow-sm rounded-sm"
              >
                Calculate Simple Interest
              </Button>
              <Button 
                onClick={() => handleCalculateInterest("Compound")} 
                className="bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs py-2 shadow-sm rounded-sm"
              >
                Calculate Compound Interest
              </Button>
            </div>

            {/* Results Display Panel */}
            {(breakdown || interestResult) && (
              <div className="mt-4 border border-zinc-300 rounded bg-zinc-50 p-3 sm:p-4 text-slate-800 space-y-3 font-mono text-xs">
                
                {breakdown && (
                  <div>
                    <h4 className="font-bold border-b border-zinc-300 pb-1 mb-2 text-slate-700 text-[10px] tracking-wider uppercase">
                      Months & Days Breakdown
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-center bg-white border border-zinc-200 rounded p-1.5 font-bold mb-2">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Years</span>
                        <span className="text-sm text-slate-900">{breakdown.years}</span>
                      </div>
                      <div className="border-x border-zinc-200">
                        <span className="text-[10px] text-slate-500 block uppercase">Months</span>
                        <span className="text-sm text-slate-900">{breakdown.months}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Days</span>
                        <span className="text-sm text-slate-900">{breakdown.days}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-slate-600 font-semibold px-1">
                      <span>Total Count: {breakdown.totalDays} Days</span>
                      <span>({breakdown.totalMonths.toFixed(2)} Months)</span>
                    </div>
                  </div>
                )}

                {interestResult && (
                  <div className="pt-2 border-t border-dashed border-zinc-300">
                    <h4 className="font-black text-slate-700 text-[10px] tracking-wider uppercase mb-2">
                      {interestResult.type} Interest Calculation
                    </h4>
                    <div className="space-y-1 font-bold">
                      <div className="flex justify-between">
                        <span>Principal Amount:</span>
                        <span className="text-slate-900">₹{amount}</span>
                      </div>
                      <div className="flex justify-between text-amber-600">
                        <span>Interest Earned:</span>
                        <span>₹{interestResult.interest}</span>
                      </div>
                      <div className="flex justify-between border-t border-zinc-300 pt-1.5 text-sm text-slate-950 font-black">
                        <span>Total Due:</span>
                        <span>₹{interestResult.total}</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default Calculator;
