import { Controller, Inject, Type } from '@nestjs/common';
import { IWritableCrudService } from '@bits/services/interface.service';
import { FindOptionsWhere, ObjectLiteral } from 'typeorm';
import {
  applyFieldMask,
  ICreateInput,
  getDefaultCreateInput,
  getDefaultDeleteInput,
  getDefaultDeleteResponse,
  getDefaultUpdateInput,
  GrpcMethodDef,
  GrpcServiceDef,
  IGrpcWriteController,
  IWritableGrpcControllerOpts,
  StatusMsg,
  IUpdateInput,
} from '@bits/grpc';

export function WritableGrpcController<
  WriteModel extends ObjectLiteral,
  B extends Type,
  ReadModel = WriteModel,
>({
  WriteModelCls,
  ServiceCls,
  CreateDTO,
  DeleteDTO,
  ReadModelCls = WriteModelCls,
  defineService = true,
  Base = class {} as any,
  separateRead = false,
}: IWritableGrpcControllerOpts<WriteModel, B>): Type<
  IGrpcWriteController<WriteModel, ReadModel> & InstanceType<B>
> {
  const GenericUpdate = getDefaultUpdateInput(WriteModelCls, ReadModelCls.name);
  const CreateInput = CreateDTO || getDefaultCreateInput(WriteModelCls, ReadModelCls.name);
  const GenericDeleteResp = getDefaultDeleteResponse(WriteModelCls, ReadModelCls.name);
  const GenericDeleteInput = DeleteDTO || getDefaultDeleteInput(WriteModelCls, ReadModelCls.name);

  @Controller()
  class WriteModelController extends Base implements IGrpcWriteController<WriteModel, ReadModel> {
    @Inject(ServiceCls) private writeSvc!: IWritableCrudService<WriteModel>;

    @GrpcMethodDef({ requestType: () => CreateInput, responseType: () => ReadModelCls })
    async createOne(newEntity: ICreateInput<WriteModel>): Promise<ReadModel> {
      const writeRes = await this.writeSvc.createOne(newEntity as any);
      if (separateRead && (this as any).readSvc && (writeRes as any).id) {
        return this.readSvc.findOne({ id: (writeRes as any).id } as any);
      }
      return writeRes as unknown as ReadModel;
    }

    @GrpcMethodDef({ requestType: () => GenericUpdate, responseType: () => ReadModelCls })
    async updateOne(input: IUpdateInput<WriteModel>): Promise<WriteModel> {
      const update = applyFieldMask(input.update, input.updateMask.paths);
      const res = (await this.writeSvc.updateOne(
        (update as any).id,
        update as any,
      )) as unknown as Promise<WriteModel>;
      // TODO
      const readEntity = (this as any).readSvc.findOne({ id: input.update.id });
      return readEntity;
    }

    @GrpcMethodDef({
      requestType: () => GenericDeleteInput,
      responseType: () => StatusMsg,
    })
    async deleteOne(input: FindOptionsWhere<WriteModel>): Promise<StatusMsg> {
      const i = input as any;
      return { success: Boolean(await this.writeSvc.deleteOne(i)) };
    }
  }
  if (defineService) GrpcServiceDef(`${WriteModelCls.name}Service`)(WriteModelController);
  return WriteModelController;
}
