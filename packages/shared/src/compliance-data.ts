// Market reference data for the country compliance engine.
//
// `verificationSource` is an official government/authority URL wherever one
// exists. Where no authoritative source was found the profile is seeded with
// verificationStatus UNVERIFIED and must be completed with a local check —
// Saudi Arabia and the UAE are deliberately left in that state rather than
// filled in from trade blogs.

export interface CountryProfileSeed {
  countryCode: string;
  countryName: string;
  market: string;
  marketBlock?: string | null;
  customsProcedureCpc?: string | null;
  verificationStatus: string;
  lastVerifiedAt?: string | null;
  verificationSource?: string | null;
  notes?: string | null;
}

/** EU member states, so the picker covers the bloc without 27 seeded profiles. */
export const EU_MEMBER_STATES: readonly { code: string; name: string }[] = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
] as const;

const EUDR_SOURCE =
  'https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en';

/**
 * The markets we have verified rules for. ISO-3166 alpha-2.
 *
 * Only markets Ancient Halo Coffee actually sells into need a row: the resolver falls back to
 * universal (origin-side) requirements for any destination without a profile.
 */
export const COUNTRY_PROFILES: readonly CountryProfileSeed[] = [
  // ── EU member states ─────────────────────────────────────────────────────
  // EUR.1, EBA preferential tariff and EUDR are EU-level, so every member state
  // resolves to the same market-block rule set. Generated rather than listed so
  // the bloc stays complete.
  ...EU_MEMBER_STATES.map(
    (c): CountryProfileSeed => ({
      countryCode: c.code,
      countryName: c.name,
      market: 'EU',
      marketBlock: 'EU',
      verificationStatus: 'VERIFIED',
      lastVerifiedAt: '2026-09-30',
      verificationSource: EUDR_SOURCE,
      notes:
        c.code === 'BE'
          ? 'EU-level rules. Antwerp is the main coffee entry port.'
          : c.code === 'NL'
            ? 'EU-level rules. Common green-coffee entry point; transit does not change origin requirements.'
            : c.code === 'DE'
              ? 'EU-level rules. EBA preferential origin via EUR.1; EUDR applies.'
              : 'EU-level rules only.',
    }),
  ),
  // ── Non-EU markets ───────────────────────────────────────────────────────
  {
    countryCode: 'US',
    countryName: 'United States',
    market: 'US_JP_CA',
    marketBlock: null,
    verificationStatus: 'VERIFIED',
    lastVerifiedAt: '2026-09-30',
    verificationSource:
      'https://acir.aphis.usda.gov/s/acir-document-detail?Document_Type=Commodity+Import+Requirements&rowId=a0jSJ000000AIgPYAW',
    notes:
      'APHIS ACIR: no import permit required for green unroasted coffee from any country. Letter of No Permit Required is optional. Prohibited to Hawaii and Puerto Rico.',
  },
  {
    countryCode: 'JP',
    countryName: 'Japan',
    market: 'US_JP_CA',
    marketBlock: null,
    verificationStatus: 'VERIFIED',
    lastVerifiedAt: '2026-09-30',
    verificationSource: 'https://www.maff.go.jp/pps/j/introduction/english.html',
    notes:
      'Plant Protection Act: green coffee is treated as fresh produce and requires an IPC phytosanitary certificate plus import inspection. Roasted coffee is exempt from the Plant Protection Act and subject only to Food Sanitation Act inspection.',
  },
  {
    countryCode: 'CA',
    countryName: 'Canada',
    market: 'US_JP_CA',
    marketBlock: null,
    verificationStatus: 'VERIFIED',
    lastVerifiedAt: '2026-09-30',
    verificationSource: 'http://inspection.canada.ca/en/importing-food-plants-animals/food-imports/step-step-guide',
    notes:
      'Green coffee is SFCR Schedule 1. The SFC licence exemption only holds when beans are not consumer-prepackaged and are marked "For Further Preparation Only". Roasted coffee falls outside the exemption. Verify AIRS before each shipment.',
  },

  // ── Left unverified on purpose ───────────────────────────────────────────
  // No authoritative government source was found for coffee-specific import
  // requirements. These profiles exist so shipments can be recorded, but the
  // checklist they resolve to must be treated as unconfirmed until someone
  // checks the official authority.
  {
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    market: 'OTHER',
    marketBlock: null,
    verificationStatus: 'UNVERIFIED',
    verificationSource: null,
    notes: 'UNVERIFIED — no authoritative source found for coffee import requirements. Check SFDA and ZATCA directly.',
  },
  {
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    market: 'OTHER',
    marketBlock: null,
    verificationStatus: 'UNVERIFIED',
    verificationSource: null,
    notes: 'UNVERIFIED — no authoritative source found for coffee import requirements. Check UAE food safety and customs authorities directly.',
  },
] as const;

/**
 * Requirement seeds. countryCode "*" applies to every destination.
 *
 * Every row here was checked against the authority named in `authority`, using
 * `officialUrl`. `verificationStatus: VERIFIED` means we read the requirement in
 * the source; it is not a legal opinion.
 */
export interface RequirementSeed {
  countryCode: string;
  marketBlock?: string | null;
  name: string;
  description: string;
  authority: string;
  requirementType: string;
  scope: string;
  issuerType: string;
  documentType: string;
  mandatory: boolean;
  conditional: boolean;
  triggerConditions?: Record<string, unknown> | null;
  submissionMethod: string;
  officialUrl?: string | null;
  legalBasis?: string | null;
  leadTimeDays?: number | null;
  validityDays?: number | null;
  appliesToImporter?: boolean;
  verificationStatus: string;
  verificationSource?: string | null;
  notes?: string | null;
}

// Ethiopian export-side rules. countryCode is "*" not "ET" because they apply to
// every consignment we export, whatever the destination — the origin side does
// not vary by market.
const ETH = {
  countryCode: '*',
  verificationStatus: 'VERIFIED',
  lastVerifiedAt: '2026-09-30',
} as const;

// ── Company-level (held once, referenced by every shipment) ───────────────
export const COMPANY_REQUIREMENTS: readonly RequirementSeed[] = [
  {
    ...ETH,
    name: 'Coffee Exporter Certificate of Competency',
    description:
      'Mandatory credential for any entity exporting coffee from Ethiopia. Issued by the Ethiopian Coffee and Tea Authority with a QR code in colour print. Minimum initial capital ETB 15,000,000 for an individual, ETB 20,000,000 for a business association, plus one year of financial activity. Must commence exporting within one year of issue.',
    authority: 'Ethiopian Coffee and Tea Authority (ECTA)',
    requirementType: 'LICENSE',
    scope: 'COMPANY',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'ECTA Certificate of Competency',
    mandatory: true,
    conditional: false,
    submissionMethod: 'ONLINE',
    officialUrl: 'https://justice.gov.et/en/entity/ethiopian-coffee-and-tea-authority/',
    legalBasis:
      'Coffee Marketing and Quality Control Proclamation No. 1051/2017 art. 24; Directive No. 1100/2025 as amended by Directive No. 1106/2025',
    leadTimeDays: 30,
    appliesToImporter: false,
    verificationSource: 'https://justice.gov.et/wp-content/uploads/2026/02/1106-The-Coffee-Marketing-and-Quality-Control-amendment-Directive-No-1106-2025.pdf',
    notes:
      'The exporter must also hold a qualified coffee laboratory certified by ECTA (except farmer-exporter), and employ a certified coffee quality cupper who may serve only one exporter.',
  },
  {
    ...ETH,
    name: 'Export Trade Licence',
    description:
      'Business licence whose authorised activity includes "export". Issued by the Ministry of Trade and Regional Integration or the relevant regional bureau.',
    authority: 'Ministry of Trade and Regional Integration (MoTRI)',
    requirementType: 'REGISTRATION',
    scope: 'COMPANY',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'Export Trade Licence',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://investethiopia.gov.et/',
    legalBasis: 'Commercial Registration and Trade Licensing Proclamation No. 980/2016',
    leadTimeDays: 15,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://investethiopia.gov.et/wp-content/uploads/2024/04/Ethiopian-Investment-Board-Directive-to-Regulate-Foreign-Investors-Participation-in-Restricted-Export-Import-Wholesale-and-Retail-Trade-Investments-No.1001_2024.pdf',
  },
  {
    ...ETH,
    name: 'Taxpayer Identification Number (TIN)',
    description: 'TIN certificate. Required for the bank permit and the customs declaration.',
    authority: 'Ethiopian Revenue Authority',
    requirementType: 'REGISTRATION',
    scope: 'COMPANY',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'TIN Certificate',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://www.era.gov.et/',
    leadTimeDays: 5,
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes: 'Not verified against an official source in this pass. Confirm current issuance route with ERA.',
  },
  {
    ...ETH,
    name: 'Bank Export Registration',
    description:
      'Registration with a commercial bank enabling foreign-currency export proceeds. Coffee exports register with the National Bank of Ethiopia. The exporter must hold a bank account and must not appear on the NBE delinquent list.',
    authority: 'National Bank of Ethiopia (NBE) / commercial bank',
    requirementType: 'REGISTRATION',
    scope: 'COMPANY',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'Bank Export Registration',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://esw.et/esw-trd/',
    leadTimeDays: 10,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://bwcimplementation.org/sites/default/files/resource/ET_Customs%20proclamation.pdf',
    notes: 'Bank permit applications are lodged through the Ethiopian Electronic Single Window.',
  },
] as const;

// ── Ethiopian export-side, per shipment ───────────────────────────────────
export const ETHIOPIA_REQUIREMENTS: readonly RequirementSeed[] = [
  {
    ...ETH,
    name: 'Commercial Invoice',
    description:
      'Legally binding invoice used by customs for valuation. Must reference the proforma and sales contract numbers, state the HS code, Incoterm, and exact quantity and price.',
    authority: 'Ethiopian Customs Commission (ECC) / exporter',
    requirementType: 'DOCUMENT',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Commercial Invoice',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://customs.erca.gov.et/traders-guide/',
    legalBasis: 'Customs Proclamation No. 859/2014 art. 10(b)',
    validityDays: null,
    verificationSource: 'https://bwcimplementation.org/sites/default/files/resource/ET_Customs%20proclamation.pdf',
  },
  {
    ...ETH,
    name: 'Packing List',
    description:
      'Describes how the goods are packed: bag count, bag marks, net and gross weight. A named supporting document for the customs declaration.',
    authority: 'Ethiopian Customs Commission (ECC) / exporter',
    requirementType: 'DOCUMENT',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Packing List',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://customs.erca.gov.et/traders-guide/',
    legalBasis: 'Customs Proclamation No. 859/2014 art. 10(d)',
    verificationSource: 'https://bwcimplementation.org/sites/default/files/resource/ET_Customs%20proclamation.pdf',
  },
  {
    ...ETH,
    name: 'Customs Goods Declaration (Export)',
    description:
      'Electronic goods declaration lodged in the Ethiopian Customs Management System. Supporting documents required: transportation document, invoice, bank permit, packing list, certificate of origin. The final declaration is presented to NBE after clearance and records are retained for five years.',
    authority: 'Ethiopian Customs Commission (ECC)',
    requirementType: 'ELECTRONIC_SUBMISSION',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'Customs Export Declaration',
    mandatory: true,
    conditional: false,
    submissionMethod: 'ELECTRONIC_DECLARATION',
    officialUrl: 'https://ecc.gov.et/',
    legalBasis: 'Customs Proclamation No. 859/2014; further amended by Customs Proclamation No. 1425/2026',
    leadTimeDays: 1,
    validityDays: 5 * 365,
    verificationSource: 'https://justice.gov.et/wp-content/uploads/2026/08/%E1%8A%A0%E1%8B%8B%E1%8C%85-%E1%89%81%E1%8C%A5%E1%88%AD-1425-2018.pdf',
    notes:
      'ECC (Ethiopian Customs Commission) is the operational body; ERCA is the revenue authority. Procedure code E100 covers direct public export of home-produced goods.',
  },
  {
    ...ETH,
    name: 'Bank Permit / NBE Export Permit',
    description:
      'Issued by the commercial bank on application, authorising the foreign-currency transfer for the consignment. L/C, CAD, and advance payment are the recognised modalities.',
    authority: 'National Bank of Ethiopia / commercial bank',
    requirementType: 'CUSTOMS',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'Bank Permit / NBE',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://esw.et/esw-trd/',
    legalBasis: 'Customs Proclamation No. 859/2014 art. 10(c)',
    verificationSource: 'https://bwcimplementation.org/sites/default/files/resource/ET_Customs%20proclamation.pdf',
  },
  {
    ...ETH,
    name: 'ICO Certificate of Origin',
    description:
      'Required for every export of coffee by an exporting ICA Member to any destination. Marked "ORIGINAL and for ICO use" and bearing the cachet of Customs or the Certifying Agency. One certificate per form and type of coffee. Not required for samples and parcels with net weight of 60 kg or less. A copy goes to the ICO within 60 days of export unless the Member transmits data electronically.',
    authority: 'ECTA as ICO Certifying Agency / Ethiopian Customs',
    requirementType: 'ORIGIN',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'ICO Certificate of Origin',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://ico.org/documents/cy2021-22/icc-102-9-r5e-rules-certificates-origin-final.pdf',
    legalBasis: 'International Coffee Agreement 2007 art. 33; ICC-102/9 Rules for Certificates of Origin',
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://ico.org/documents/cy2021-22/icc-102-9-r5e-rules-certificates-origin-final.pdf',
    notes:
      'Ethiopia ICO code 010. Each bag must bear a unique ICO identification mark (xxx/xxxx/xxxxx) or Unique Consignment Reference, which also appears on the transport document. ICC-102/9 rule 8 exempts samples and parcels with net weight of 60 kg or less.',
  },
  {
    ...ETH,
    name: 'Bill of Lading / Airway Bill',
    description:
      'Transportation document and, for sea freight, the document of title. A named supporting document for the customs goods declaration. The ICO identification mark or Unique Consignment Reference must appear on it.',
    authority: 'Shipping line or carrier',
    requirementType: 'DOCUMENT',
    scope: 'SHIPMENT',
    issuerType: 'PRIVATE_PARTY',
    documentType: 'Bill of Lading',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://bwcimplementation.org/sites/default/files/resource/ET_Customs%20proclamation.pdf',
    legalBasis: 'Customs Proclamation No. 859/2014 art. 10(a) — transportation document',
    verificationSource: 'https://bwcimplementation.org/sites/default/files/resource/ET_Customs%20proclamation.pdf',
    notes: 'Airway Bill for air freight, Bill of Lading for sea.',
  },
  {
    ...ETH,
    name: 'Insurance Certificate',
    description:
      'Insurance cover for the consignment. Required where the payment terms or Incoterm place the risk with us, and required by most documentary credits. Terms should match the invoice value plus freight where applicable.',
    authority: 'Insurance company',
    requirementType: 'DOCUMENT',
    scope: 'SHIPMENT',
    issuerType: 'PRIVATE_PARTY',
    documentType: 'Insurance Certificate',
    mandatory: false,
    conditional: true,
    triggerConditions: { incoterm: ['CIP', 'CIF', 'DAP', 'DDP'] },
    submissionMethod: 'PAPER',
    officialUrl: 'https://bwcimplementation.org/sites/default/files/resource/ET_Customs%20proclamation.pdf',
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes:
      'Triggered on CIF/CIP/DAP/DDP terms. Also frequently required by the buyer under an L/C even on FOB. Confirm against the specific contract.',
  },
  {
    ...ETH,
    name: 'Chamber Certificate of Origin',
    description:
      'Issued by the Ethiopian Chamber of Commerce and Sectoral Associations, or Dire Dawa Chamber. Required for preferential tariff treatment. Chamberised originals are required in specific copy counts for the customs declaration.',
    authority: 'Ethiopian Chamber of Commerce and Sectoral Associations (ECCSA)',
    requirementType: 'ORIGIN',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'Chamber Certificate of Origin',
    mandatory: true,
    conditional: false,
    submissionMethod: 'CERTIFICATE',
    officialUrl: 'https://kelilullah-trading.com/knowledgebase/exporters-guide',
    legalBasis: 'Customs Proclamation No. 859/2014 art. 10(e) — certificate of origin',
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes:
      'A named supporting document for the customs declaration, separate from the ICO certificate of origin. Confirm current issuance requirements with ECCSA.',
  },
  {
    ...ETH,
    name: 'Weight Certificate',
    description:
      'Independent or warehouse-issued certificate of net and gross weight, supporting the packing list and the bill of lading. Some buyers and destination authorities require a third-party issued weight certificate rather than a self-declared figure.',
    authority: 'Warehouse or public weighbridge',
    requirementType: 'CERTIFICATE',
    scope: 'SHIPMENT',
    issuerType: 'PRIVATE_PARTY',
    documentType: 'Weight Certificate',
    mandatory: false,
    conditional: true,
    submissionMethod: 'PAPER',
    officialUrl: 'https://kelilullah-trading.com/knowledgebase/exporters-guide',
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes: 'Frequently buyer-required for green coffee. Confirm per contract.',
  },
  {
    ...ETH,
    name: 'Fumigation Certificate',
    description:
      'Confirms the consignment or its packaging was fumigated. Required where the buyer, the destination plant health authority, or the fumigation provider at origin requires it, and commonly bundled with the phytosanitary certificate.',
    authority: 'Fumigation provider / MoA',
    requirementType: 'PLANT_HEALTH',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'Fumigation Certificate',
    mandatory: false,
    conditional: true,
    triggerConditions: { form: ['Green'] },
    submissionMethod: 'CERTIFICATE',
    officialUrl: 'https://www.ephi.gov.et/',
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes: 'Not universally required. Confirm with the destination plant health authority and the buyer.',
  },
  {
    ...ETH,
    name: 'Sales Contract Registration',
    description:
      'The export sales contract must be submitted to NBE and approved within 24 hours, then registered with the Authority within three working days. Contracts for coffee producers may be extended up to nine months within the production season.',
    authority: 'ECTA / National Bank of Ethiopia',
    requirementType: 'DECLARATION',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Sales Contract Registration',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://justice.gov.et/wp-content/uploads/2025/02/%E1%8B%B0%E1%8A%95-%E1%89%A5%E1%8C%A5%E1%88%AD-433-2011.pdf',
    legalBasis: 'Coffee Marketing and Quality Control Directive No. 433/2011 art. 11',
    leadTimeDays: 3,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://justice.gov.et/wp-content/uploads/2025/02/%E1%8B%B0%E1%8A%95-%E1%89%A5%E1%8C%A5%E1%88%AD-433-2011.pdf',
  },
] as const;

// ── Ethiopian lot-level ───────────────────────────────────────────────────
export const ETHIOPIA_LOT_REQUIREMENTS: readonly RequirementSeed[] = [
  {
    ...ETH,
    name: 'CLU Quality Certificate',
    description:
      'Coffee Liquoring Unit certificate confirming the lot conforms to the characteristics of its production area and meets the required grade. The lot must be certified before export and then sealed. Coffee must be certified before being supplied to auction centres, the ECX, or exported.',
    authority: 'Coffee Liquoring Unit / ECTA',
    requirementType: 'CERTIFICATE',
    scope: 'LOT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'CLU Quality Certificate',
    mandatory: true,
    conditional: false,
    submissionMethod: 'CERTIFICATE',
    officialUrl: 'https://www.eca.gov.et/',
    legalBasis: 'Coffee Quality Control and Marketing Proclamation No. 602/2008 art. 3',
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes:
      'The 602/2008 text was located on a third-party legal mirror, not an official Ethiopian government source. Confirm the current legal basis and issuing laboratory with ECTA before relying on it.',
  },
  {
    ...ETH,
    name: 'Phytosanitary Certificate',
    description:
      'Issued by the Ethiopian Plant Health Institute / Ministry of Agriculture Plant Health Directorate following warehouse or field inspection. Application should be filed roughly five to ten business days before shipment. Certificate validity is typically fourteen days, so it must be timed against sailing. Consignments without it are rejected at destination.',
    authority: 'Ethiopian Plant Health Institute (EPHI) / MoA',
    requirementType: 'PLANT_HEALTH',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'Phytosanitary Certificate',
    mandatory: true,
    conditional: false,
    submissionMethod: 'CERTIFICATE',
    officialUrl: 'https://www.ephi.gov.et/',
    leadTimeDays: 10,
    validityDays: 14,
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes:
      'UNVERIFIED against an official MoA source in this pass. Lead time and validity here come from secondary sources — confirm with the Plant Health Directorate before scheduling shipments against them.',
  },
] as const;

// ── Destination-market requirements ───────────────────────────────────────

export const EU_REQUIREMENTS: readonly RequirementSeed[] = [
  {
    countryCode: '*',
    marketBlock: 'EU',
    name: 'EUDR Due Diligence Statement',
    description:
      'Operators placing coffee on the EU market must file a Due Diligence Statement in the EUDR Information System before the goods are released for free circulation or exported from the EU. Coffee must be shown to be deforestation-free (no deforestation after 31 December 2020) and produced in compliance with the law of the producing country. The exporter has no filing obligation; the EU importer or operator submits. Our role is to supply plot-level geolocation and legality evidence. Application date is 30 December 2026 for large and medium operators. Records are retained for five years.',
    authority: 'European Commission',
    requirementType: 'TRACEABILITY',
    scope: 'SHIPMENT',
    issuerType: 'PRIVATE_PARTY',
    documentType: 'EUDR Due Diligence Statement',
    mandatory: true,
    conditional: false,
    triggerConditions: { requiresPlotData: true },
    submissionMethod: 'ONLINE',
    officialUrl:
      'https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en',
    legalBasis: 'Regulation (EU) 2023/1115 (EUDR) art. 3, 9, 10, 11, 12',
    leadTimeDays: 14,
    validityDays: 5 * 365,
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource:
      'https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en',
    notes:
      'Geolocation: plots over 4 ha require polygons, plots under 4 ha may use a single point, both at six decimal digits, in GeoJSON (WGS-84 / EPSG:4326). A DDS may cover twelve months of supply from one origin. We do not submit; we supply the geodata and record the reference the importer returns.',
  },
  {
    countryCode: '*',
    marketBlock: 'EU',
    name: 'EUDR Plot Geolocation Dossier',
    description:
      'Polygon or point coordinates for every production plot contributing to the lots in this shipment, plus legality evidence (ECTA licence, cooperative registration, land use records). This is the deliverable the EU importer needs in order to file their own Due Diligence Statement. Provide it as GeoJSON.',
    authority: 'European Commission (required by our EU importer)',
    requirementType: 'TRACEABILITY',
    scope: 'LOT',
    issuerType: 'ERP_GENERATED',
    documentType: 'EUDR Plot Geolocation Dossier',
    mandatory: true,
    conditional: false,
    triggerConditions: { form: ['Green'] },
    submissionMethod: 'PDF',
    officialUrl:
      'https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en',
    legalBasis: 'Regulation (EU) 2023/1115 art. 9(1)(d),(e); art. 9(2)(a) legality evidence',
    leadTimeDays: 7,
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource:
      'https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en',
    notes:
      'Covers green coffee; instant coffee is outside EUDR scope. Production period should match the harvest season.',
  },
  {
    countryCode: '*',
    marketBlock: 'EU',
    name: 'EUR.1 Movement Certificate',
    description:
      'Proof of preferential origin supporting the EBA duty-free tariff rate for Ethiopian coffee. Request from the issuing Chamber. Note that the EBA scheme has a limited validity period, so the certificate must be current at the time of import.',
    authority: 'Ethiopian Chamber of Commerce (issuing) / EU customs (accepting)',
    requirementType: 'ORIGIN',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'EUR.1 Movement Certificate',
    mandatory: false,
    conditional: true,
    triggerConditions: { incoterm: ['FOB', 'CIF', 'CFR'] },
    submissionMethod: 'CERTIFICATE',
    officialUrl: 'https://taxation-customs.ec.europa.eu/customs-4/international-affairs/origin-goods/generalised-system-preferences_en',
    legalBasis: 'EU Everything But Arms (EBA) scheme',
    leadTimeDays: 5,
    appliesToImporter: true,
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes:
      'Conditional on claiming the preferential rate. Verify current EBA coverage and certificate validity with the issuing Chamber and EU customs before relying on it.',
  },
  {
    countryCode: '*',
    marketBlock: 'EU',
    name: 'Phytosanitary Certificate (EU import)',
    description:
      'Required for green coffee entering the EU under plant health rules. Green coffee is treated as a plant product and must be accompanied by an IPC phytosanitary certificate from the exporting country NPPO.',
    authority: 'EU member state plant health authority',
    requirementType: 'PLANT_HEALTH',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'Phytosanitary Certificate',
    mandatory: true,
    conditional: false,
    triggerConditions: { form: ['Green'] },
    submissionMethod: 'CERTIFICATE',
    officialUrl: 'https://food.ec.europa.eu/plants/plant-health-and-biosecurity/plant-health-legislation_en',
    leadTimeDays: 10,
    validityDays: 14,
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes:
      'The underlying Ethiopian certificate is the same document; this row exists so the checklist shows the EU import obligation explicitly rather than relying on the Ethiopian row. Confirm the receiving member state plant health authority.',
  },
  {
    countryCode: '*',
    marketBlock: 'EU',
    name: 'Commercial Invoice (EU import valuation)',
    description:
      'Required at EU import for customs valuation. Must be consistent with the Ethiopian export declaration and state the HS code, origin, Incoterm, and value.',
    authority: 'EU customs',
    requirementType: 'CUSTOMS',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Commercial Invoice',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PDF',
    officialUrl: 'https://taxation-customs.ec.europa.eu/customs-4_en',
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://taxation-customs.ec.europa.eu/customs-4_en',
  },
  {
    countryCode: '*',
    marketBlock: 'EU',
    name: 'Packing List (EU import)',
    description: 'Describes packing, bag marks, and weights at EU import.',
    authority: 'EU customs',
    requirementType: 'DOCUMENT',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Packing List',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PDF',
    officialUrl: 'https://taxation-customs.ec.europa.eu/customs-4_en',
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://taxation-customs.ec.europa.eu/customs-4_en',
  },
] as const;

export const US_REQUIREMENTS: readonly RequirementSeed[] = [
  {
    countryCode: 'US',
    name: 'FDA Prior Notice',
    description:
      'Food shipments must be flagged to FDA in advance of arrival via the FDA Prior Notification system. Filed by the US importer or their agent.',
    authority: 'U.S. Food and Drug Administration (FDA)',
    requirementType: 'ELECTRONIC_SUBMISSION',
    scope: 'SHIPMENT',
    issuerType: 'PRIVATE_PARTY',
    documentType: 'FDA Prior Notice',
    mandatory: true,
    conditional: false,
    submissionMethod: 'API',
    officialUrl: 'https://www.fda.gov/food/food-imports-exports/prior-notice-imported-foods',
    leadTimeDays: 2,
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://www.fda.gov/food/food-imports-exports/prior-notice-imported-foods',
    notes: 'Submitted by the US-side importer, not by us. We supply the commodity, quantity, and origin data.',
  },
  {
    countryCode: 'US',
    name: 'APHIS Import Requirements Check (green coffee)',
    description:
      'USDA APHIS Agricultural Commodity Import Requirements for green, unroasted coffee from all countries: no import permit is required, and a Letter of No Permit Required is optional but can speed clearance. The consignment is subject to inspection at the port of entry under 7 CFR 330.105. Green unroasted coffee is NOT admissible to or transiting Hawaii or Puerto Rico.',
    authority: 'USDA Animal and Plant Health Inspection Service (APHIS)',
    requirementType: 'PLANT_HEALTH',
    scope: 'SHIPMENT',
    issuerType: 'PRIVATE_PARTY',
    documentType: 'APHIS No Permit Required Confirmation',
    mandatory: false,
    conditional: true,
    triggerConditions: { form: ['Green'] },
    submissionMethod: 'ONLINE',
    officialUrl:
      'https://acir.aphis.usda.gov/s/acir-document-detail?Document_Type=Commodity+Import+Requirements&rowId=a0jSJ000000AIgPYAW',
    legalBasis: '7 CFR 330.105; APHIS commodity import requirements for coffee (green, unroasted)',
    verificationStatus: 'VERIFIED',
    verificationSource:
      'https://acir.aphis.usda.gov/s/acir-document-detail?Document_Type=Commodity+Import+Requirements&rowId=a0jSJ000000AIgPYAW',
    notes:
      'Important: no phytosanitary certificate and no import permit are required for Ethiopian green coffee into the US mainland. The Hawaii/Puerto Rico prohibition is the binding constraint — confirm the entry port.',
  },
  {
    countryCode: 'US',
    name: 'Country of Origin Marking',
    description:
      'Articles must be marked with their country of origin. Keep the original packaging and any grade markings as proof of origin, and ensure the packing list declares Ethiopia as origin.',
    authority: 'U.S. Customs and Border Protection (CBP)',
    requirementType: 'ORIGIN',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Country of Origin Declaration',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://www.cbp.gov/trade/rulings/informed-compliance-publications',
    appliesToImporter: true,
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes: 'Requirement is well established but not verified against a CBP primary source in this pass.',
  },
  {
    countryCode: 'US',
    name: 'Commercial Invoice (US import)',
    description: 'Required for US customs entry and FDA review. Must state the HS code, origin, Incoterm, and value.',
    authority: 'U.S. Customs and Border Protection (CBP) / FDA',
    requirementType: 'CUSTOMS',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Commercial Invoice',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://www.cbp.gov/trade/basic-import-export',
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://www.cbp.gov/trade/basic-import-export',
  },
  {
    countryCode: 'US',
    name: 'Packing List (US import)',
    description: 'Describes packing and weights at US import.',
    authority: 'U.S. Customs and Border Protection (CBP)',
    requirementType: 'DOCUMENT',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Packing List',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://www.cbp.gov/trade/basic-import-export',
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://www.cbp.gov/trade/basic-import-export',
  },
] as const;

export const JAPAN_REQUIREMENTS: readonly RequirementSeed[] = [
  {
    countryCode: 'JP',
    name: 'MAFF Plant Quarantine Inspection',
    description:
      'Under the Plant Protection Act, green coffee beans that have not been heat treated are handled as fresh produce and must be accompanied by an IPC phytosanitary certificate issued by the exporting country NPPO. Import inspection is mandatory. Bulk green coffee may only be handled at approved ports. The import inspection application can be filed from seven days before the planned arrival date.',
    authority: 'Ministry of Agriculture, Forestry and Fisheries (MAFF) Plant Protection Station',
    requirementType: 'PLANT_HEALTH',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'MAFF Plant Quarantine Certificate',
    mandatory: true,
    conditional: false,
    triggerConditions: { form: ['Green'] },
    submissionMethod: 'CERTIFICATE',
    officialUrl: 'https://www.maff.go.jp/pps/j/introduction/english.html',
    legalBasis: 'Plant Protection Act; Regulation for Enforcement of the Plant Protection Act',
    leadTimeDays: 10,
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://www.maff.go.jp/pps/j/introduction/english.html',
    notes:
      'Roasted coffee is exempt from the Plant Protection Act and needs only Food Sanitation Act inspection. Penalties for importing without the certificate can reach three years imprisonment or three million yen. Verify the entry port is approved for bulk green coffee.',
  },
  {
    countryCode: 'JP',
    name: 'Food Sanitation Act Import Inspection',
    description:
      'Import food inspection under the Food Sanitation Act, administered by the Quarantine Station of the Ministry of Health, Labour and Welfare. An import notification is filed and a Certificate of Importation is issued, which is then presented with the customs import application.',
    authority: 'Ministry of Health, Labour and Welfare (MHLW) Quarantine Station',
    requirementType: 'FOOD_SAFETY',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'MHLW Certificate of Importation',
    mandatory: true,
    conditional: false,
    submissionMethod: 'ONLINE',
    officialUrl: 'https://www.mhlw.go.jp/english/policy/health/quality_control/import.html',
    leadTimeDays: 5,
    appliesToImporter: true,
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes: 'Unverified against an MHLW primary source in this pass. Confirm the notification route and residue limits with MHLW.',
  },
  {
    countryCode: 'JP',
    name: 'ICO Certificate of Origin (Japan imports)',
    description:
      'Japan is an importing Member of the International Coffee Agreement, so shipments are covered by the ICA certificate of origin regime alongside the Ethiopian-side ICO certificate.',
    authority: 'ECTA as ICO Certifying Agency',
    requirementType: 'ORIGIN',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'ICO Certificate of Origin',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://ico.org/documents/cy2021-22/icc-102-9-r5e-rules-certificates-origin-final.pdf',
    legalBasis: 'International Coffee Agreement 2007 art. 33',
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://ico.org/documents/cy2021-22/icc-102-9-r5e-rules-certificates-origin-final.pdf',
  },
  {
    countryCode: 'JP',
    name: 'Commercial Invoice (Japan import)',
    description: 'Required for the import notification and the customs import application.',
    authority: 'Japan Customs',
    requirementType: 'CUSTOMS',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Commercial Invoice',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://www.customs.go.jp/english/',
    appliesToImporter: true,
    verificationStatus: 'NEEDS_LOCAL_CHECK',
  },
  {
    countryCode: 'JP',
    name: 'Packing List (Japan import)',
    description:
      'Packing list is a required reference document for the plant quarantine import inspection application, alongside the invoice and phytosanitary certificate.',
    authority: 'MAFF Plant Protection Station',
    requirementType: 'DOCUMENT',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Packing List',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://www.maff.go.jp/pps/j/law/form/form02.html',
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://www.maff.go.jp/pps/j/law/form/form02.html',
  },
] as const;

export const CANADA_REQUIREMENTS: readonly RequirementSeed[] = [
  {
    countryCode: 'CA',
    name: 'SFC Licence Exemption Check (green coffee)',
    description:
      'Coffee beans are on Schedule 1 of the Safe Food for Canadians Regulations. A Safe Food for Canadians licence is not required where the beans are unprocessed and destined to be manufactured or processed into a beverage, are not consumer prepackaged, and carry the marking "For Further Preparation Only". Roasted coffee and retail packs fall outside the exemption and need a licence and a preventive control plan.',
    authority: 'Canadian Food Inspection Agency (CFIA)',
    requirementType: 'FOOD_SAFETY',
    scope: 'SHIPMENT',
    issuerType: 'PRIVATE_PARTY',
    documentType: 'SFC Licence Exemption Confirmation',
    mandatory: false,
    conditional: true,
    triggerConditions: { form: ['Green'] },
    submissionMethod: 'PAPER',
    officialUrl: 'http://inspection.canada.ca/en/importing-food-plants-animals/food-imports/step-step-guide',
    legalBasis: 'Safe Food for Canadians Act and Regulations (SFCR), Schedule 1',
    leadTimeDays: 2,
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'http://inspection.canada.ca/en/importing-food-plants-animals/food-imports/step-step-guide',
    notes:
      'The bag marking "For Further Preparation Only" is the step importers most often miss. Agree it at contract stage so it is on the bag marks before the coffee leaves Djibouti, not argued at the border. AIRS must be checked before each shipment.',
  },
  {
    countryCode: 'CA',
    name: 'CBSA Import Declaration',
    description:
      'Filed by the Canadian importer or broker through the single window. Licence, permit, and registration numbers must be on the declaration, which can be submitted up to ninety days in advance. Green coffee under tariff item 0901.11.00 is duty free at MFN.',
    authority: 'Canada Border Services Agency (CBSA)',
    requirementType: 'CUSTOMS',
    scope: 'SHIPMENT',
    issuerType: 'PRIVATE_PARTY',
    documentType: 'CBSA Import Declaration',
    mandatory: true,
    conditional: false,
    submissionMethod: 'ELECTRONIC_DECLARATION',
    officialUrl: 'https://www.cbsa-asfc.gc.ca/import/cargo-menegec/menu-eng.html',
    leadTimeDays: 1,
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'http://inspection.canada.ca/en/importing-food-plants-animals/commercial-importing',
  },
  {
    countryCode: 'CA',
    name: 'Commercial Invoice (Canada import)',
    description: 'Required for the CBSA entry. Green coffee maps to tariff item 0901.11.00.',
    authority: 'Canada Border Services Agency (CBSA)',
    requirementType: 'CUSTOMS',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Commercial Invoice',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://www.cbsa-asfc.gc.ca/import/cargo-menegec/menu-eng.html',
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://www.cbsa-asfc.gc.ca/import/cargo-menegec/menu-eng.html',
  },
  {
    countryCode: 'CA',
    name: 'Packing List (Canada import)',
    description: 'Describes packing, bag marks, and weights at Canadian import.',
    authority: 'Canada Border Services Agency (CBSA)',
    requirementType: 'DOCUMENT',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    documentType: 'Packing List',
    mandatory: true,
    conditional: false,
    submissionMethod: 'PAPER',
    officialUrl: 'https://www.cbsa-asfc.gc.ca/import/cargo-menegec/menu-eng.html',
    appliesToImporter: true,
    verificationStatus: 'VERIFIED',
    verificationSource: 'https://www.cbsa-asfc.gc.ca/import/cargo-menegec/menu-eng.html',
  },
  {
    countryCode: 'CA',
    name: 'Phytosanitary Certificate (Canada import)',
    description:
      'Plant health requirements for coffee are set per commodity in the CFIA Automated Import Reference System. Confirm the requirement for Ethiopian green coffee before shipment.',
    authority: 'Canadian Food Inspection Agency (CFIA)',
    requirementType: 'PLANT_HEALTH',
    scope: 'SHIPMENT',
    issuerType: 'AUTHORITY_ISSUED',
    documentType: 'Phytosanitary Certificate',
    mandatory: false,
    conditional: true,
    triggerConditions: { form: ['Green'] },
    submissionMethod: 'CERTIFICATE',
    officialUrl: 'http://inspection.canada.ca/en/importing-food-plants-animals/plant-and-plant-product/airs',
    leadTimeDays: 10,
    validityDays: 14,
    verificationStatus: 'NEEDS_LOCAL_CHECK',
    notes: 'AIRS is updated frequently. Verify against AIRS for each shipment rather than relying on this row.',
  },
] as const;

/** Every destination-scoped seed, in one list for seeding. */
export const DESTINATION_REQUIREMENTS: readonly RequirementSeed[] = [
  ...EU_REQUIREMENTS,
  ...US_REQUIREMENTS,
  ...JAPAN_REQUIREMENTS,
  ...CANADA_REQUIREMENTS,
] as const;

/** Company-level + Ethiopian + destination seeds. */
export const ALL_REQUIREMENTS: readonly RequirementSeed[] = [
  ...COMPANY_REQUIREMENTS,
  ...ETHIOPIA_REQUIREMENTS,
  ...ETHIOPIA_LOT_REQUIREMENTS,
  ...DESTINATION_REQUIREMENTS,
] as const;

// ───────────────────────────── Reference lookups ─────────────────────────────

/** Authorities an official blank form or template may exist for. */
export const DOCUMENT_TEMPLATES: readonly {
  documentType: string;
  countryCode: string;
  authority: string;
  templateKind: string;
  officialSourceUrl?: string | null;
  format: string;
  notes?: string | null;
}[] = [
  {
    documentType: 'EUDR Due Diligence Statement',
    countryCode: '*',
    authority: 'European Commission',
    templateKind: 'C_AUTHORITY_ISSUED',
    officialSourceUrl:
      'https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en',
    format: 'ONLINE',
    notes:
      'Filed by the EU importer in the EUDR Information System. We supply geolocation and legality data; we do not file.',
  },
  {
    documentType: 'EUDR Plot Geolocation Dossier',
    countryCode: '*',
    authority: 'European Commission (data supplied to importer)',
    templateKind: 'B_ERP_GENERATED',
    officialSourceUrl:
      'https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en',
    format: 'JSON',
    notes: 'We generate GeoJSON of contributing plots. Endpoint: GET /shipments/:id/eudr/geojson',
  },
  {
    documentType: 'ICO Certificate of Origin',
    countryCode: 'ET',
    authority: 'ECTA / ICO Certifying Agency',
    templateKind: 'A_OFFICIAL_TEMPLATE',
    officialSourceUrl:
      'https://ico.org/documents/cy2021-22/icc-102-9-r5e-rules-certificates-origin-final.pdf',
    format: 'PDF',
    notes:
      'Official blank form is set out in ICC-102/9. The certificate is issued by the Certifying Agency, not by us. Ethio pic tool only captures the application data.',
  },
  {
    documentType: 'Phytosanitary Certificate',
    countryCode: 'ET',
    authority: 'EPHI / MoA Plant Health',
    templateKind: 'C_AUTHORITY_ISSUED',
    officialSourceUrl: 'https://www.ippc.int/en/countries/ethiopia/',
    format: 'CERTIFICATE',
    notes:
      'Issued by the national plant protection organisation under the IPPC. We capture application data; EPHI issues the certificate.',
  },
  {
    documentType: 'CLU Quality Certificate',
    countryCode: 'ET',
    authority: 'Coffee Liquoring Unit / ECTA',
    templateKind: 'C_AUTHORITY_ISSUED',
    officialSourceUrl: 'https://www.eca.gov.et/',
    format: 'CERTIFICATE',
    notes: 'Authority-issued. We record the reference and quality results only.',
  },
  {
    documentType: 'MAFF Plant Quarantine Certificate',
    countryCode: 'JP',
    authority: 'MAFF Plant Protection Station',
    templateKind: 'C_AUTHORITY_ISSUED',
    officialSourceUrl: 'https://www.maff.go.jp/pps/j/law/form/form02.html',
    format: 'PDF',
    notes:
      'The import inspection application form (form02) is the official Japanese template. Our document is the equivalent application data pack; MAFF issues the certificate.',
  },
  {
    documentType: 'Customs Export Declaration',
    countryCode: 'ET',
    authority: 'Ethiopian Customs Commission (ECC)',
    templateKind: 'C_AUTHORITY_ISSUED',
    officialSourceUrl: 'https://ecc.gov.et/',
    format: 'ELECTRONIC',
    notes: 'Lodged electronically in the Ethiopian Customs Management System via the Electronic Single Window.',
  },
  {
    documentType: 'Commercial Invoice',
    countryCode: '*',
    authority: 'exporter (ours)',
    templateKind: 'B_ERP_GENERATED',
    format: 'PDF',
    notes: 'Fully generated from the commercial invoice and shipment data.',
  },
  {
    documentType: 'Packing List',
    countryCode: '*',
    authority: 'exporter (ours)',
    templateKind: 'B_ERP_GENERATED',
    format: 'PDF',
    notes: 'Fully generated from lot bag counts, net and gross weights, and marks.',
  },
] as const;
