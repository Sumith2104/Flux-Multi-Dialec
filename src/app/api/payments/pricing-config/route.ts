import { NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';

export async function GET() {
    try {
        const pool = getPgPool();
        const result = await pool.query(
            `SELECT pro_price, max_price, discount_pro_price, discount_max_price, enable_discount, discount_code 
             FROM fluxbase_global.pricing_configs 
             ORDER BY id DESC LIMIT 1`
        );

        if (result.rows.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'Pricing configuration not found'
            }, { status: 404 });
        }

        const config = result.rows[0];

        return NextResponse.json({
            success: true,
            pricing: {
                proPrice: parseFloat(config.pro_price),
                maxPrice: parseFloat(config.max_price),
                discountProPrice: parseFloat(config.discount_pro_price),
                discountMaxPrice: parseFloat(config.discount_max_price),
                enableDiscount: config.enable_discount,
                discountCode: config.discount_code
            }
        });
    } catch (err: any) {
        console.error('[Pricing Config API Error]:', err);
        return NextResponse.json({
            success: false,
            error: 'Internal server error occurred while retrieving pricing configurations.'
        }, { status: 500 });
    }
}
export const dynamic = 'force-dynamic';
