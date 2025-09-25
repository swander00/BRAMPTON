# 🗄️ Database Setup Guide

## Step-by-Step Instructions to Create Your Property & Media Tables

### 1. **Open Supabase Dashboard**
1. Go to [supabase.com](https://supabase.com)
2. Sign in to your account
3. Select your project: `gyeviskmqtkskcoyyprp`

### 2. **Open SQL Editor**
1. In the left sidebar, click **"SQL Editor"**
2. Click **"New Query"**

### 3. **Run the Table Creation Script**
1. Copy the entire contents of `create-tables.sql`
2. Paste it into the SQL Editor
3. Click **"Run"** (or press Ctrl+Enter)

### 4. **Verify Tables Created**
1. Go to **"Table Editor"** in the left sidebar
2. You should see:
   - ✅ **Property** table (with ~50 columns)
   - ✅ **Media** table (with ~15 columns)

## 🎯 **What This Creates**

### **Property Table**
- **Primary Key**: `ListingKey` (MLS listing ID)
- **Financial**: `ListPrice`, `ClosePrice`, taxes, fees
- **Location**: Full address breakdown, postal codes
- **Features**: Bedrooms, bathrooms, parking, amenities
- **Arrays**: Property features, cooling systems, etc.
- **Timestamps**: For incremental sync tracking

### **Media Table**
- **Primary Key**: `MediaKey` (unique media ID)
- **Links to**: `ResourceRecordKey` → `Property.ListingKey`
- **Media Info**: URLs, types, descriptions, order
- **Timestamps**: For incremental media sync

### **Performance Features**
- ✅ **Indexes** on commonly queried fields (city, price, bedrooms)
- ✅ **Foreign Key** linking media to properties
- ✅ **Auto-updating** `UpdatedAt` timestamps
- ✅ **Comments** documenting each field

## 🧪 **Test Your Tables**

After creating, test with these queries:

```sql
-- Test Property table
SELECT COUNT(*) FROM "Property";

-- Test Media table  
SELECT COUNT(*) FROM "Media";

-- Test relationship
SELECT p."ListingKey", p."City", COUNT(m."MediaKey") as media_count
FROM "Property" p
LEFT JOIN "Media" m ON p."ListingKey" = m."ResourceRecordKey"
GROUP BY p."ListingKey", p."City"
LIMIT 5;
```

## 🔐 **Security (Optional)**

The tables are created without Row Level Security (RLS) enabled. If you want to add authentication later:

```sql
-- Enable RLS
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Media" ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for IDX properties)
CREATE POLICY "Allow public read access" ON "Property" 
FOR SELECT USING (true);

CREATE POLICY "Allow public read access" ON "Media" 
FOR SELECT USING (true);
```

## ⚡ **Ready for Sync**

Once tables are created, your backend can:
1. **Sync properties** from AMPRE to Supabase
2. **Sync media** (photos, virtual tours)  
3. **Serve API endpoints** for your frontend
4. **Handle incremental updates** automatically

## 🆘 **Need Help?**

If you get any errors:
1. Make sure you're in the **correct Supabase project**
2. Check the **SQL Editor** for error messages
3. Try running sections of the script separately
4. The backend will work with basic tables even if some features fail

---

**Next Step**: After tables are created, test the backend sync! 🚀
