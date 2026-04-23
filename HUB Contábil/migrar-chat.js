const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TENANT_ID = 'Triade'; // ✅ Valor exato do campo tenantId
const CANAIS = ['geral', 'fiscal', 'dp', 'contabil'];

async function renomear() {
  for (const canal of CANAIS) {
    const antigoId = `undefined_${canal}`;
    const novoId = `${TENANT_ID}_${canal}`;

    console.log(`\n📦 Renomeando: ${antigoId} → ${novoId}`);

    const msgs = await db.collection('channels').doc(antigoId).collection('messages').get();

    if (msgs.empty) {
      console.log(`   ⚠️ Nenhuma mensagem em ${antigoId}, pulando.`);
      continue;
    }

    // Copia para o novo ID
    const docs = msgs.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach(doc => {
        const novoRef = db.collection('channels').doc(novoId).collection('messages').doc(doc.id);
        batch.set(novoRef, doc.data());
      });
      await batch.commit();
      console.log(`   ✅ ${Math.min(i + 400, docs.length)} mensagens copiadas`);
    }

    // Deleta o antigo
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    await db.collection('channels').doc(antigoId).delete();
    console.log(`   ✔️ ${antigoId} renomeado com sucesso!`);
  }

  console.log('\n🎉 Concluído!');
  process.exit();
}

renomear().catch(err => { console.error(err); process.exit(1); });