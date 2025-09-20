# Payment Tolerance Standardization Fix

## Issue
The TatumService had inconsistent payment tolerance systems:
1. **Webhook processing**: Used 1% percentage-based tolerance
2. **Manual address checking**: Used 0.01 fixed amount tolerance

This created inconsistent payment validation behavior across different payment detection methods.

## Solution Applied

### **Standardized Tolerance System**

1. **🔧 Unified Tolerance Method**:
   ```typescript
   private isPaymentSufficient(received: number, expected: number, tolerancePercent?: number): boolean {
     const tolerancePercentToUse = tolerancePercent ?? this.defaultTolerancePercent;
     const tolerance = expected * (tolerancePercentToUse / 100);
     const minimumRequired = expected - tolerance;
     
     return received >= minimumRequired;
   }
   ```

2. **⚙️ Configurable Default Tolerance**:
   ```typescript
   // Environment variable: PAYMENT_TOLERANCE_PERCENT (default: 1%)
   this.defaultTolerancePercent = parseFloat(process.env.PAYMENT_TOLERANCE_PERCENT || '1');
   ```

3. **📊 Updated Method Signatures**:
   ```typescript
   // Before: Fixed 0.01 amount tolerance
   async checkAddressForPayments(address: string, currency: string, expectedAmount: number, tolerance: number = 0.01)
   
   // After: Percentage-based tolerance
   async checkAddressForPayments(address: string, currency: string, expectedAmount: number, tolerancePercent?: number)
   ```

### **Key Changes Made**

#### **1. TatumService Constructor**
- Added `defaultTolerancePercent` property
- Reads from `PAYMENT_TOLERANCE_PERCENT` environment variable
- Defaults to 1% if not configured

#### **2. Enhanced isPaymentSufficient Method**
- Added detailed debug logging
- Uses configurable default tolerance
- Clear variable naming for tolerance calculations

#### **3. Updated checkAddressForPayments Method**
- Changed from fixed amount tolerance to percentage-based
- Now uses the standardized `isPaymentSufficient` method
- Maintains backward compatibility with optional parameter

#### **4. Health Status Enhancement**
- Added `defaultTolerancePercent` to health status response
- Provides visibility into current tolerance configuration

### **Payment Logic**

**Formula**: `received >= (expected - (expected * tolerancePercent / 100))`

**Examples with 1% tolerance**:
- $100 order: Accepts $99.00+ (1% = $1.00 tolerance)
- $10 order: Accepts $9.90+ (1% = $0.10 tolerance)  
- $1 order: Accepts $0.99+ (1% = $0.01 tolerance)

### **Configuration**

Add to your environment variables:
```bash
# Set payment tolerance percentage (default: 1%)
PAYMENT_TOLERANCE_PERCENT=1.5  # 1.5% tolerance
```

### **Benefits**

1. **✅ Consistent Behavior**: Both webhook and manual payment detection use same tolerance logic
2. **🔧 Configurable**: Tolerance can be adjusted via environment variable
3. **📊 Proportional**: Tolerance scales with payment amount (percentage-based)
4. **🔍 Observable**: Tolerance configuration visible in health status
5. **📝 Logged**: Payment sufficiency checks are logged for debugging

### **Testing Recommendations**

1. **Test different payment amounts** with various tolerance percentages
2. **Verify webhook processing** uses same tolerance as manual checking
3. **Test edge cases** around the tolerance boundary
4. **Confirm configuration** via health endpoint
5. **Monitor logs** for payment sufficiency decisions

### **Files Modified**

- `packages/backend/src/services/tatumService.ts`
  - Standardized tolerance system
  - Added configurable default tolerance
  - Enhanced logging and documentation

## Result

Payment tolerance is now consistent across all payment detection methods, using a configurable percentage-based system that scales appropriately with payment amounts.