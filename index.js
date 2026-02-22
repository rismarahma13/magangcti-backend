require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcrypt");

const app = express();

// ==========================================================
// 1. KONFIGURASI CORS (SOLUSI FIX ERROR BROWSER)
// ==========================================================
app.use(
  cors({
    origin: "*", // Mengizinkan semua domain (termasuk localhost kamu)
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    credentials: true,
  }),
);

// Middleware tambahan untuk memastikan Preflight Request (OPTIONS) selalu dijawab 200 OK
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Limit Body (Ditingkatkan menjadi 50mb untuk menampung upload file asli)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ==========================================================
// 2. INISIALISASI SUPABASE CLIENT
// ==========================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================================
// 3. KONFIGURASI UPLOAD & HELPER STORAGE
// ==========================================================
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Batasi 5MB per file
});

// Fungsi Helper untuk upload file asli ke Supabase Storage Bucket
const uploadToSupabase = async (file, bucketName, folder) => {
  const fileExt = file.originalname.split(".").pop();
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (error) throw error;

  const { data: publicUrl } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);
  return publicUrl.publicUrl;
};

// ==========================================================
// 4. ROUTES API
// ==========================================================

// --- HOME ROUTE ---
app.get("/", (req, res) => {
  res.json({ message: "Backend Magang CTI is Running with File Storage! 🚀" });
});

// --- A. AUTHENTICATION ---
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (error || !user)
      return res.status(401).json({ error: "Username tidak ditemukan!" });

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword && user.password !== password) {
      return res.status(401).json({ error: "Password salah!" });
    }

    res.json({
      message: "Login berhasil!",
      user: {
        id: user.id,
        nama: user.nama_lengkap,
        role: user.role,
        foto_profil: user.foto_profil,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/register", async (req, res) => {
  const { nama_lengkap, nim, jurusan, no_hp, username, password } = req.body;
  try {
    const { data: cek } = await supabase
      .from("users")
      .select("id")
      .eq("username", username);
    if (cek && cek.length > 0)
      return res.status(400).json({ error: "Username sudah dipakai!" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          nama_lengkap,
          nim,
          jurusan,
          no_hp,
          username,
          password: hashedPassword,
          role: "peserta",
          status_laporan: "locked",
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- B. CRUD USER ---
app.get("/users/:role", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("role", req.params.role)
      .order("id", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/users", async (req, res) => {
  const {
    nama_lengkap,
    nim,
    jurusan,
    no_hp,
    username,
    password,
    role,
    company_id,
  } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          nama_lengkap,
          nim: nim || null,
          jurusan: jurusan || null,
          no_hp: no_hp || null,
          username,
          password: hashedPassword,
          role,
          status_laporan: "locked",
          company_id: company_id || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const {
    nama_lengkap,
    nim,
    jurusan,
    no_hp,
    username,
    password,
    role,
    company_id,
  } = req.body;
  try {
    let updateData = {
      nama_lengkap,
      nim,
      jurusan,
      no_hp,
      username,
      role,
      company_id: company_id || null,
    };

    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const { error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id);
    if (error) throw error;
    res.json({ message: "User updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/users/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "User dihapus" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE PROFILE (DENGAN FILE ASLI)
app.put(
  "/update-profile/:id",
  upload.single("foto_profil"),
  async (req, res) => {
    const { id } = req.params;
    const { nama_lengkap, no_hp, password } = req.body;
    let updateData = { nama_lengkap, no_hp };

    try {
      if (req.file) {
        // UPLOAD FILE ASLI KE STORAGE
        const fileUrl = await uploadToSupabase(req.file, "uploads", "profiles");
        updateData.foto_profil = fileUrl;
      }

      if (password && password.trim() !== "") {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(password, salt);
      }

      const { error: updateErr } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", id);
      if (updateErr) throw updateErr;

      const { data, error: selectErr } = await supabase
        .from("users")
        .select("id, nama_lengkap, role, foto_profil")
        .eq("id", id)
        .single();
      if (selectErr) throw selectErr;

      res.json({ message: "Update sukses", user: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// --- C. PERUSAHAAN ---
app.get("/companies", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("id", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.post("/companies", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("companies")
      .insert([
        {
          nama_perusahaan: req.body.nama_perusahaan,
          alamat: req.body.alamat,
          kontak: req.body.kontak,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.put("/companies/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("companies")
      .update({
        nama_perusahaan: req.body.nama_perusahaan,
        alamat: req.body.alamat,
        kontak: req.body.kontak,
      })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "Company updated" });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.delete("/companies/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("companies")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ msg: "Deleted" });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

// --- D. PLACEMENT ---
app.get("/placements", async (req, res) => {
  try {
    const { data, error } = await supabase.from("placements").select(`
      id, user_id, supervisor_id, company_id,
      peserta:user_id (nama_lengkap, nim, jurusan, no_hp, foto_profil),
      supervisor:supervisor_id (nama_lengkap),
      company:company_id (nama_perusahaan)
    `);
    if (error) throw error;

    const formatted = data.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      supervisor_id: p.supervisor_id,
      company_id: p.company_id,
      peserta: p.peserta?.nama_lengkap,
      nim: p.peserta?.nim,
      jurusan: p.peserta?.jurusan,
      no_hp: p.peserta?.no_hp,
      foto_profil: p.peserta?.foto_profil,
      supervisor: p.supervisor?.nama_lengkap,
      nama_perusahaan: p.company?.nama_perusahaan,
    }));
    res.json(formatted);
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.post("/placements", async (req, res) => {
  try {
    const { user_id, supervisor_id, company_id } = req.body;
    const { data: cek } = await supabase
      .from("placements")
      .select("*")
      .eq("user_id", user_id);
    if (cek && cek.length > 0)
      return res.status(400).json({ error: "Peserta sudah ditempatkan!" });

    const { data, error } = await supabase
      .from("placements")
      .insert([{ user_id, supervisor_id, company_id }])
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.delete("/placements/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("placements")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ msg: "Deleted" });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.get("/placement-detail/:userId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("placements")
      .select(
        `id, company:company_id(nama_perusahaan, alamat), supervisor:supervisor_id(nama_lengkap)`,
      )
      .eq("user_id", req.params.userId)
      .single();

    if (error || !data) return res.json(null);

    res.json({
      id: data.id,
      nama_perusahaan: data.company?.nama_perusahaan,
      alamat: data.company?.alamat,
      supervisor: data.supervisor?.nama_lengkap,
    });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

// --- E. LOGBOOK (DENGAN FILE ASLI) ---
app.post("/logbook", upload.single("bukti_foto"), async (req, res) => {
  try {
    const { user_id, kegiatan, tanggal, kehadiran } = req.body;
    let bukti_foto_url = null;

    if (req.file) {
      // UPLOAD FILE ASLI KE STORAGE
      bukti_foto_url = await uploadToSupabase(req.file, "uploads", "logbooks");
    }

    const { data, error } = await supabase
      .from("logbooks")
      .insert([
        {
          user_id,
          tanggal,
          kegiatan,
          bukti_foto: bukti_foto_url,
          status: "menunggu",
          kehadiran: kehadiran || "Hadir",
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/logbook/:userId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("logbooks")
      .select("*")
      .eq("user_id", req.params.userId)
      .order("tanggal", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.get("/all-logbooks", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("logbooks")
      .select(`*, user:user_id(nama_lengkap)`)
      .order("tanggal", { ascending: false });
    if (error) throw error;
    res.json(data.map((l) => ({ ...l, nama_lengkap: l.user?.nama_lengkap })));
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.put("/logbook/:id", upload.single("bukti_foto"), async (req, res) => {
  try {
    const { id } = req.params;
    const { kegiatan, tanggal, kehadiran } = req.body;
    let updateData = { tanggal, kegiatan, kehadiran: kehadiran || "Hadir" };

    if (req.file) {
      const fileUrl = await uploadToSupabase(req.file, "uploads", "logbooks");
      updateData.bukti_foto = fileUrl;
    }

    const { error } = await supabase
      .from("logbooks")
      .update(updateData)
      .eq("id", id);
    if (error) throw error;
    res.json({ msg: "Updated" });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.put("/logbook-status/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("logbooks")
      .update({ status: req.body.status, catatan: req.body.catatan })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ msg: "Status updated" });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.delete("/logbook/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("logbooks")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ msg: "Deleted" });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

// --- F. PENILAIAN ---
app.post("/nilai", async (req, res) => {
  const {
    user_id,
    nilai_disiplin,
    nilai_kerjasama,
    nilai_inisiatif,
    nilai_tanggung_jawab,
    nilai_teknis,
    catatan,
  } = req.body;
  try {
    if (!user_id)
      return res.status(400).json({ error: "Mahasiswa belum dipilih!" });

    const { data: cek } = await supabase
      .from("evaluations")
      .select("*")
      .eq("user_id", user_id);
    if (cek && cek.length > 0)
      return res.status(400).json({ error: "Mahasiswa ini sudah dinilai!" });

    const n1 = parseFloat(nilai_disiplin) || 0;
    const n2 = parseFloat(nilai_kerjasama) || 0;
    const n3 = parseFloat(nilai_inisiatif) || 0;
    const n4 = parseFloat(nilai_tanggung_jawab) || 0;
    const n5 = parseFloat(nilai_teknis) || 0;
    const rataFix = parseFloat(((n1 + n2 + n3 + n4 + n5) / 5).toFixed(2));
    let predikat =
      rataFix >= 85
        ? "A (Sangat Baik)"
        : rataFix >= 75
          ? "B (Baik)"
          : rataFix >= 60
            ? "C (Cukup)"
            : rataFix >= 50
              ? "D (Kurang)"
              : "E (Gagal)";

    const { data, error } = await supabase
      .from("evaluations")
      .insert([
        {
          user_id,
          nilai_disiplin: n1,
          nilai_kerjasama: n2,
          nilai_inisiatif: n3,
          nilai_tanggung_jawab: n4,
          nilai_teknis: n5,
          rata_rata: rataFix,
          predikat,
          catatan: catatan || "",
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/nilai/:userId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("evaluations")
      .select("*")
      .eq("user_id", req.params.userId)
      .single();
    res.json(data || null);
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.get("/admin/rekap-nilai", async (req, res) => {
  try {
    const { data: evals, error } = await supabase
      .from("evaluations")
      .select("*, user:user_id(nama_lengkap, nim, jurusan)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const { data: places } = await supabase
      .from("placements")
      .select("user_id, company:company_id(nama_perusahaan)");
    const placesMap = {};
    if (places) {
      places.forEach(
        (p) => (placesMap[p.user_id] = p.company?.nama_perusahaan),
      );
    }

    res.json(
      evals.map((e) => ({
        nama_lengkap: e.user?.nama_lengkap,
        nim: e.user?.nim,
        jurusan: e.user?.jurusan,
        nama_perusahaan: placesMap[e.user_id] || "-",
        nilai_disiplin: e.nilai_disiplin,
        nilai_kerjasama: e.nilai_kerjasama,
        nilai_teknis: e.nilai_teknis,
        rata_rata: e.rata_rata,
        predikat: e.predikat,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- G. LAPORAN & STATS (FILE ASLI) ---
app.post("/upload-laporan", upload.single("file_laporan"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "File tidak ditemukan" });

    // UPLOAD FILE ASLI KE STORAGE
    const fileUrl = await uploadToSupabase(req.file, "uploads", "laporan");

    const { error } = await supabase
      .from("users")
      .update({
        laporan_akhir: fileUrl,
        tgl_upload_laporan: new Date().toISOString(),
        status_laporan: "pending",
      })
      .eq("id", req.body.user_id);

    if (error) throw error;
    res.json({ msg: "Uploaded", url: fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/laporan-status/:userId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("laporan_akhir, tgl_upload_laporan")
      .eq("id", req.params.userId)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/approve-report/:userId", async (req, res) => {
  try {
    const { error } = await supabase
      .from("users")
      .update({ status_laporan: "approved" })
      .eq("id", req.params.userId);
    if (error) throw error;
    res.json({ message: "Approved" });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.get("/check-report-status/:userId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("status_laporan")
      .eq("id", req.params.userId)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.get("/admin/stats", async (req, res) => {
  try {
    const getCount = async (table, match = {}) => {
      const { count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .match(match);
      return count || 0;
    };
    res.json({
      total_peserta: await getCount("users", { role: "peserta" }),
      total_supervisor: await getCount("users", { role: "supervisor" }),
      total_logbooks: await getCount("logbooks"),
      total_lulus: await getCount("evaluations"),
      total_perusahaan: await getCount("companies"),
      total_placed: await getCount("placements"),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(
    `🚀 Server berjalan di port ${PORT} (Menggunakan Supabase API + Storage)`,
  );
});

module.exports = app;
