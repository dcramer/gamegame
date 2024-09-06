import Heading from "@/components/heading";
import Layout from "@/components/layout";
import { findOrphanBlobs } from "@/lib/actions/blobs";
import BlobList from "./blob-list";

export default async function Page() {
  const blobList = await findOrphanBlobs();

  return (
    <Layout>
      <Heading>Orphan Blobs</Heading>
      <BlobList blobList={blobList} />
    </Layout>
  );
}
