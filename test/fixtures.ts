/**
 * P0 Nasty Test Fixture Datasets
 * Covering edge cases: quoted CSV, leading zeroes, monetary figures,
 * ambiguous dates, emojis, Unicode, Indian names/phones, placeholders.
 */

export const NASTY_CSV_FIXTURE = `Order ID,Customer Name,Phone Number,Order Total,Order Date,Postal Code,Notes
ORD-001,JOHNATHAN DOE,09876543210,$1,420.50,03/04/2024,07030,"Prefers morning delivery, Apt #4B"
ORD-002,jane m. smith,+91 98765 43210,$89.00,2024-03-14,94103,"Notes with
embedded newline and ""quotes"""
ORD-003,Rahul Sharma,919876543210,₹4,500.00,15/03/2024,500081,Hyderabad tech lead 🚀
ORD-004,RAHUL SHARMA,09876543210,₹4,500.00,15/03/2024,500081,Duplicate of Rahul Sharma
ORD-005,Emily Watson,512-555-0177,$215.00,null,02138,N/A
ORD-006,Renée Müller-Lübeck,+49 30 123456,$520.00,2024-03-20,10115,Special characters: ñ, ü, é, å
ORD-007,Alex Thorne,00124,$0.00,UNKNOWN,00501,-`;

export const DUPLICATE_CSV_FIXTURE = `Lead ID,Name,Email,City
LD-101,John Doe,john@acme.com,New York
LD-102,John Doe,john@acme.com,new york
LD-103,Sarah Jenkins,sarah@corp.org,Austin
LD-104,SARAH JENKINS,sarah@corp.org,AUSTIN
LD-105,Robert Chen,robert@test.io,San Francisco`;

export const LEADING_ZERO_FIXTURE = [
  { id: '001', zip: '07030', account: '000912' },
  { id: '002', zip: '02138', account: '000913' },
  { id: '003', zip: '00501', account: '000914' },
];

export const MONETARY_FIXTURE = [
  { order_id: 'ORD-1', amount: '$142.50' },
  { order_id: 'ORD-2', amount: '€89.00' },
  { order_id: 'ORD-3', amount: '£310.20' },
];
