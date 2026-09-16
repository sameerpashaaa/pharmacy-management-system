import fs from "fs";
import path from "path";

// Load .env manually
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#\s]+?)=(.*)$/);
        if (match) {
            let val = match[2].trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            process.env[match[1].trim()] = val;
        }
    });
}

import { PaymentMethod, PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function randomDate(start: Date, end: Date) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
    const admin = await prisma.user.findFirst();
    const branch = await prisma.branch.findFirst();
    if (!admin || !branch) throw new Error("Need user and branch to create dummy data.");

    console.log("Generating Customers...");
    const customerNames = ["John Doe", "Jane Smith", "Alice Johnson", "Bob Brown", "Charlie Davis"];
    const customers = [];
    for (const name of customerNames) {
        const cust = await prisma.customer.create({
            data: {
                name,
                phone: "98" + Math.floor(10000000 + Math.random() * 90000000).toString(),
            }
        });
        customers.push(cust);
    }

    console.log("Adding Inventory and Batches for random products...");
    // Get 50 products
    const products = await prisma.product.findMany({ take: 50 });
    
    for (const p of products) {
        const batchNumber = `B-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
        const batch = await prisma.batch.create({
            data: {
                productId: p.id,
                batchNumber,
                expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)), // 2 years from now
                purchasePrice: 40.00,
                mrp: 100.00,
                quantity: 100,
                
                branchId: branch.id,
                status: 'ACTIVE'
            }
        });

        // Upsert inventory
        const inv = await prisma.inventory.upsert({
            where: { productId_branchId: { productId: p.id, branchId: branch.id } },
            update: {
                totalQuantity: { increment: 100 },
                availableQuantity: { increment: 100 },
            },
            create: {
                productId: p.id,
                branchId: branch.id,
                totalQuantity: 100,
                availableQuantity: 100,
            }
        });
        
        await prisma.inventoryMovement.create({
            data: {
                inventoryId: inv.id,
                type: 'IN',
                quantity: 100,
                quantityBefore: inv.availableQuantity - 100,
                quantityAfter: inv.availableQuantity,
                createdById: admin.id,
                batchId: batch.id
            }
        });
    }

    console.log("Generating Sales...");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const now = new Date();
    const paymentMethods: PaymentMethod[] = ["CASH", "UPI", "CARD"];

    for (let i = 0; i < 60; i++) {
        // Pick 1-4 random products
        const numItems = Math.floor(Math.random() * 4) + 1;
        const items = [];
        let totalAmount = 0;
        
        const saleDate = randomDate(thirtyDaysAgo, now);

        for (let j = 0; j < numItems; j++) {
            const prod = products[Math.floor(Math.random() * products.length)];
            const qty = Math.floor(Math.random() * 3) + 1;
            const price = 100; // mrp used above
            
            items.push({
                productId: prod.id,
                productName: prod.name,
                productSku: prod.sku,
                quantity: qty,
                unitPrice: price,
                totalAmount: qty * price,
                mrp: price
            });
            totalAmount += (qty * price);
        }

        const sale = await prisma.sale.create({
            data: {
                invoiceNumber: `INV-DUMMY-${Date.now()}-${i}`,
                branchId: branch.id,
                customerId: Math.random() > 0.5 ? customers[Math.floor(Math.random() * customers.length)].id : null,
                saleDate,
                subtotal: totalAmount,
                totalAmount: totalAmount,
                amountPaid: totalAmount,
                status: 'COMPLETED',
                paymentStatus: 'PAID',
                createdById: admin.id,
                createdAt: saleDate, // match saleDate for realistic charts
                items: {
                    create: items
                }
            }
        });
        
        await prisma.payment.create({
            data: {
                saleId: sale.id,
                method: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
                amount: totalAmount,
                paymentDate: saleDate,
                createdAt: saleDate
            }
        });
    }

    console.log("Dummy data generation complete!");
    process.exit(0);
}

main().catch(console.error);
