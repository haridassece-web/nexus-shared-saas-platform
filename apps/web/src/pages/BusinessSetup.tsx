import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";

export function BusinessSetup() {
  const [name, setName] = useState("");
  const [type, setType] = useState("retail_shop");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("33");
  const [prefix, setPrefix] = useState("INV");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Update default prefix when category changes
  function handleTypeChange(val: string) {
    setType(val);
    const prefixes: Record<string, string> = {
      hospital: "HOSP",
      clinic: "CLN",
      dental_clinic: "DENT",
      pharmacy: "PHARM",
      diagnostic_lab: "LAB",
      gym: "GYM",
      yoga_centre: "YOGA",
      fitness_studio: "FIT",
      salon: "SAL",
      beauty_parlour: "BTY",
      spa: "SPA",
      vegetable_fruits_shop: "VEG",
      fruits_vegetables_shop: "VEG",
      supermarket: "SMART",
      grocery_store: "GROC",
      retail_shop: "RET",
      restaurant: "REST",
      hotel: "HOTEL",
      bakery: "BAKE",
      automobile_workshop: "AUTO",
      bike_service_centre: "BIKE",
      car_wash: "WASH",
      education_centre: "EDU",
      tuition_centre: "TUIT",
      college: "CLG",
      digital_agency: "MKT",
      website_development: "WEB",
      cctv_services: "CCTV",
    };
    if (prefixes[val]) {
      setPrefix(prefixes[val]);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const b: any = await api("/api/businesses", {
        method: "POST",
        body: JSON.stringify({
          name,
          business_type: type,
          gstin: gstin || null,
          state_code: state,
          invoice_prefix: prefix || "INV",
          phone: phone || null,
          address: address || null,
        }),
      });
      localStorage.setItem("nexus_business_id", b.id);
      setMsg(`Business created: ${b.name}. Redirecting to Workspace…`);
      setTimeout(() => navigate("/"), 1200);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">TENANT ONBOARDING · 60 READY-MADE CATEGORIES</p>
      <h1>Add your business</h1>
      <p className="muted">
        Select your business category to automatically configure invoice templates, fields, and starter items.
      </p>

      <form onSubmit={submit}>
        <label>
          Business Name *
          <input
            required
            placeholder="e.g. Apollo Healthcare / Nexus Fitness Club"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label>
          Business Category (Select from 60 Template Engines) *
          <select value={type} onChange={(e) => handleTypeChange(e.target.value)}>
            <optgroup label="🏥 Healthcare & Clinical (8)">
              <option value="hospital">Hospital</option>
              <option value="clinic">Clinic</option>
              <option value="dental_clinic">Dental Clinic</option>
              <option value="pharmacy">Pharmacy</option>
              <option value="diagnostic_lab">Diagnostic Lab</option>
              <option value="medical_centre">Medical Centre</option>
              <option value="physiotherapy">Physiotherapy</option>
              <option value="veterinary_clinic">Veterinary Clinic</option>
            </optgroup>

            <optgroup label="🏋️ Fitness, Wellness & Spas (4)">
              <option value="gym">Gym</option>
              <option value="yoga_centre">Yoga Centre</option>
              <option value="fitness_studio">Fitness Studio</option>
              <option value="spa">Spa</option>
            </optgroup>

            <optgroup label="✂️ Personal Care & Grooming (3)">
              <option value="salon">Salon</option>
              <option value="beauty_parlour">Beauty Parlour</option>
              <option value="tailoring">Tailoring</option>
            </optgroup>

            <optgroup label="🛒 Retail, Fresh Produce & Trading (13)">
              <option value="vegetable_fruits_shop">Vegetable & Fruits Shop</option>
              <option value="supermarket">Supermarket</option>
              <option value="grocery_store">Grocery Store</option>
              <option value="retail_shop">Retail Shop</option>
              <option value="textile_shop">Textile Shop</option>
              <option value="garments_shop">Garments Shop</option>
              <option value="electrical_shop">Electrical Shop</option>
              <option value="hardware_shop">Hardware Shop</option>
              <option value="furniture_shop">Furniture Shop</option>
              <option value="mobile_shop">Mobile Shop</option>
              <option value="computer_shop">Computer Shop</option>
              <option value="electronics_shop">Electronics Shop</option>
              <option value="pet_shop">Pet Shop</option>
            </optgroup>

            <optgroup label="🍽️ Food, Bakery & Hospitality (6)">
              <option value="restaurant">Restaurant</option>
              <option value="hotel">Hotel</option>
              <option value="bakery">Bakery</option>
              <option value="catering">Catering</option>
              <option value="juice_shop">Juice Shop</option>
              <option value="coffee_shop">Coffee Shop</option>
            </optgroup>

            <optgroup label="🚗 Automobile & Fuel (4)">
              <option value="automobile_workshop">Automobile Workshop</option>
              <option value="bike_service_centre">Bike Service Centre</option>
              <option value="car_wash">Car Wash</option>
              <option value="petrol_bunk">Petrol Bunk</option>
            </optgroup>

            <optgroup label="🔧 Services & Maintenance (7)">
              <option value="laundry">Laundry</option>
              <option value="dry_cleaning">Dry Cleaning</option>
              <option value="mobile_repair">Mobile Repair</option>
              <option value="hardware_services">Hardware Services</option>
              <option value="plumbing_services">Plumbing Services</option>
              <option value="electrical_services">Electrical Services</option>
              <option value="cctv_services">CCTV Services</option>
            </optgroup>

            <optgroup label="🏢 Real Estate & Construction (4)">
              <option value="real_estate">Real Estate</option>
              <option value="property_management">Property Management</option>
              <option value="construction">Construction</option>
              <option value="interior_design">Interior Design</option>
            </optgroup>

            <optgroup label="💻 IT, Software & Digital (3)">
              <option value="networking_it">Networking & IT</option>
              <option value="digital_agency">Digital Agency</option>
              <option value="website_development">Website Development</option>
            </optgroup>

            <optgroup label="🎓 Education & Colleges (3)">
              <option value="education_centre">Education Centre</option>
              <option value="tuition_centre">Tuition Centre</option>
              <option value="college">College</option>
            </optgroup>

            <optgroup label="📸 Events, Media & Logistics (6)">
              <option value="travel_agency">Travel Agency</option>
              <option value="event_management">Event Management</option>
              <option value="photography">Photography</option>
              <option value="printing_shop">Printing Shop</option>
              <option value="courier_services">Courier Services</option>
              <option value="general_services">General Services</option>
            </optgroup>
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <label>
            Invoice Prefix
            <input
              maxLength={10}
              placeholder="e.g. INV / HOSP / GYM"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            />
          </label>

          <label>
            GST State Code
            <input
              maxLength={2}
              placeholder="33"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </label>
        </div>

        <label>
          GSTIN (Optional)
          <input
            maxLength={15}
            placeholder="e.g. 33AAAAA0000A1Z5"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
          />
        </label>

        <label>
          Phone Number (Optional)
          <input
            placeholder="e.g. +91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        <label>
          Store / Clinic Address (Optional)
          <input
            placeholder="e.g. 12, Main Road, Anna Nagar"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        <button className="primary full" disabled={busy} style={{ marginTop: "1rem" }}>
          {busy ? "Setting up workspace & templates…" : "Create Business Workspace"}
        </button>
      </form>

      {msg && <p className="muted" style={{ marginTop: "1rem" }}>{msg}</p>}
    </section>
  );
}
